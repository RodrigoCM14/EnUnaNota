const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const PUBLIC_URL = process.env.PUBLIC_URL || "";
const DEFAULT_SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "8791a946e68c476cac41c3d5023a86a7";
const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "playlist-read-private",
  "playlist-read-collaborative"
];

const rooms = new Map();
const clients = new Map();
const spotifyAuthStates = new Map();
const spotifySessions = new Map();
const oauthEvents = [];

function logOAuth(event, details = {}) {
  oauthEvents.unshift({
    at: new Date().toISOString(),
    event,
    ...details
  });
  oauthEvents.length = Math.min(oauthEvents.length, 20);
}

function getRoom(id = "default") {
  if (!rooms.has(id)) {
    rooms.set(id, {
      id,
      players: {},
      buzzes: [],
      round: null,
      clipSeconds: 5,
      playlistName: "",
      updatedAt: Date.now()
    });
  }
  return rooms.get(id);
}

function publicRoom(room) {
  return {
    id: room.id,
    players: Object.values(room.players).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
    buzzes: room.buzzes,
    round: room.round,
    clipSeconds: room.clipSeconds,
    playlistName: room.playlistName,
    updatedAt: room.updatedAt
  };
}

function broadcast(roomId) {
  const room = getRoom(roomId);
  const payload = `data: ${JSON.stringify(publicRoom(room))}\n\n`;
  const set = clients.get(roomId);
  if (!set) return;
  for (const res of set) res.write(payload);
}

function touch(room) {
  room.updatedAt = Date.now();
  broadcast(room.id);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function sendRedirect(res, location, extraHeaders = {}) {
  res.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  res.end();
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml"
  }[ext] || "application/octet-stream";
}

function serveStatic(req, res, pathname) {
  let route = pathname === "/" ? "index.html" : pathname === "/player" ? "player.html" : pathname.replace(/^\/+/, "");
  if (route === "public" || route === "public/") route = "index.html";
  if (route.startsWith("public/")) route = route.slice("public/".length) || "index.html";

  const filePath = path.resolve(PUBLIC_DIR, route);
  const publicRoot = path.resolve(PUBLIC_DIR);
  if (filePath !== publicRoot && !filePath.startsWith(publicRoot + path.sep)) {
    logOAuth("static-forbidden", { pathname, route, filePath });
    res.writeHead(302, {
      Location: "/",
      "Cache-Control": "no-store"
    });
    res.end();
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    const finalPath = !statError && stats.isDirectory() ? path.join(filePath, "index.html") : filePath;
    fs.readFile(finalPath, (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": contentType(finalPath),
        "Cache-Control": "no-store"
      });
      res.end(data);
    });
  });
}

function localAddresses() {
  const addresses = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) addresses.push(entry.address);
    }
  }
  return addresses;
}

function randomString(length) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length);
}

function base64Url(buffer) {
  return buffer.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function originFromRequest(req) {
  const forwardedHost = req.headers["x-forwarded-host"];
  const forwardedProto = req.headers["x-forwarded-proto"];
  const origin = forwardedHost
    ? `${forwardedProto || "https"}://${forwardedHost}`
    : `http://${req.headers.host}`;
  return (PUBLIC_URL || origin).replace(/^http:\/\/(.+\.onrender\.com)$/i, "https://$1");
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map(item => item.trim())
      .filter(Boolean)
      .map(item => {
        const index = item.indexOf("=");
        return index === -1 ? [item, ""] : [item.slice(0, index), decodeURIComponent(item.slice(index + 1))];
      })
  );
}

function spotifyCookie(sid, secure) {
  const parts = [
    `spotify_sid=${encodeURIComponent(sid)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=2592000"
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function getSpotifySession(req) {
  const sid = parseCookies(req).spotify_sid;
  if (!sid) return null;
  const session = spotifySessions.get(sid);
  return session ? { sid, session } : null;
}

function rememberSpotifyState(state, data) {
  spotifyAuthStates.set(state, { ...data, createdAt: Date.now() });
  const expiresBefore = Date.now() - 10 * 60 * 1000;
  for (const [key, value] of spotifyAuthStates) {
    if (value.createdAt < expiresBefore) spotifyAuthStates.delete(key);
  }
}

async function requestSpotifyToken(tokenBody) {
  const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody
  });
  const token = await tokenResponse.json().catch(() => ({ error: "Respuesta invalida de Spotify" }));
  return { status: tokenResponse.status, ok: tokenResponse.ok, token };
}

function saveSpotifyToken(session, token) {
  session.accessToken = token.access_token || session.accessToken || "";
  session.refreshToken = token.refresh_token || session.refreshToken || "";
  session.expiresAt = Date.now() + Number(token.expires_in || 3600) * 1000;
}

async function refreshSpotifySession(session) {
  if (!session?.refreshToken || Date.now() < session.expiresAt - 30_000) return Boolean(session?.accessToken);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: session.refreshToken,
    client_id: session.clientId || DEFAULT_SPOTIFY_CLIENT_ID
  });
  const result = await requestSpotifyToken(body);
  if (!result.ok || !result.token.access_token) return false;
  saveSpotifyToken(session, result.token);
  return true;
}

async function startSpotifyLogin(req, res, searchParams) {
  const origin = originFromRequest(req);
  const sid = parseCookies(req).spotify_sid || randomString(32);
  const clientId = String(searchParams.get("client_id") || DEFAULT_SPOTIFY_CLIENT_ID).trim();
  const redirectUri = `${origin}/spotify/callback`;
  const verifier = randomString(96);
  const state = randomString(32);
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());

  spotifySessions.set(sid, {
    ...(spotifySessions.get(sid) || {}),
    clientId
  });
  rememberSpotifyState(state, { verifier, clientId, redirectUri, sid, origin });
  logOAuth("login-start", { origin, redirectUri, sid: sid.slice(0, 8) });

  const auth = new URL("https://accounts.spotify.com/authorize");
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("scope", SPOTIFY_SCOPES.join(" "));
  auth.searchParams.set("code_challenge_method", "S256");
  auth.searchParams.set("code_challenge", challenge);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("state", state);

  sendRedirect(res, auth.href, { "Set-Cookie": spotifyCookie(sid, origin.startsWith("https://")) });
}

async function finishSpotifyLogin(req, res, searchParams) {
  const error = searchParams.get("error");
  const state = searchParams.get("state") || "";
  const remembered = state ? spotifyAuthStates.get(state) : null;
  if (state) spotifyAuthStates.delete(state);
  const origin = remembered?.origin || originFromRequest(req);
  const appHome = `${origin}/`;

  if (error) {
    logOAuth("callback-error", { error, state: state.slice(0, 8) });
    sendRedirect(res, `${appHome}?spotify=error&message=${encodeURIComponent(error)}`);
    return;
  }

  const code = searchParams.get("code") || "";
  if (!code || !remembered?.verifier) {
    logOAuth("callback-expired", { hasCode: Boolean(code), state: state.slice(0, 8) });
    sendRedirect(res, `${appHome}?spotify=error&message=${encodeURIComponent("Sesion OAuth expirada")}`);
    return;
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: remembered.redirectUri,
    client_id: remembered.clientId,
    code_verifier: remembered.verifier
  });
  const result = await requestSpotifyToken(body);
  if (!result.ok || !result.token.access_token) {
    const detail = result.token.error_description || result.token.error || "No se pudo obtener token";
    logOAuth("token-error", { status: result.status, detail });
    sendRedirect(res, `${appHome}?spotify=error&message=${encodeURIComponent(detail)}`);
    return;
  }

  const session = spotifySessions.get(remembered.sid) || {};
  session.clientId = remembered.clientId;
  saveSpotifyToken(session, result.token);
  spotifySessions.set(remembered.sid, session);
  logOAuth("token-success", { sid: remembered.sid.slice(0, 8), expiresAt: session.expiresAt });
  sendRedirect(res, `${appHome}?spotify=connected`, {
    "Set-Cookie": spotifyCookie(remembered.sid, origin.startsWith("https://"))
  });
}

async function handleApi(req, res, pathname, searchParams) {
  const roomId = searchParams.get("room") || "default";
  const room = getRoom(roomId);

  if (pathname === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });
    res.write(`data: ${JSON.stringify(publicRoom(room))}\n\n`);
    if (!clients.has(roomId)) clients.set(roomId, new Set());
    clients.get(roomId).add(res);
    req.on("close", () => clients.get(roomId)?.delete(res));
    return;
  }

  if (req.method === "GET" && pathname === "/api/info") {
    sendJson(res, 200, {
      port: PORT,
      origin: originFromRequest(req),
      addresses: localAddresses(),
      room: publicRoom(room)
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/oauth-debug") {
    const current = getSpotifySession(req);
    sendJson(res, 200, {
      hasSession: Boolean(current),
      sessionConnected: Boolean(current?.session?.accessToken),
      events: oauthEvents
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/spotify-login") {
    await startSpotifyLogin(req, res, searchParams);
    return;
  }

  if (req.method === "GET" && pathname === "/api/spotify-session") {
    const current = getSpotifySession(req);
    if (!current) return sendJson(res, 200, { connected: false });
    const refreshed = await refreshSpotifySession(current.session);
    if (!refreshed) return sendJson(res, 200, { connected: false });
    sendJson(res, 200, {
      connected: true,
      accessToken: current.session.accessToken,
      expiresAt: current.session.expiresAt
    });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const body = await readBody(req);

  if (pathname === "/api/spotify-logout") {
    const sid = parseCookies(req).spotify_sid;
    if (sid) spotifySessions.delete(sid);
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Set-Cookie": "spotify_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (pathname === "/api/join") {
    const name = String(body.name || "").trim().slice(0, 24);
    if (!name) return sendJson(res, 400, { error: "Nombre requerido" });
    const id = body.id || crypto.randomUUID();
    room.players[id] = room.players[id] || { id, name, score: 0, buzzedAt: null };
    room.players[id].name = name;
    touch(room);
    sendJson(res, 200, { player: room.players[id], room: publicRoom(room) });
    return;
  }

  if (pathname === "/api/buzz") {
    const player = room.players[body.playerId];
    if (!player) return sendJson(res, 404, { error: "Jugador no encontrado" });
    if (!room.round || room.round.revealed) {
      return sendJson(res, 409, { error: "No hay una ronda activa" });
    }
    if (!room.buzzes.some(item => item.playerId === player.id)) {
      const buzz = { playerId: player.id, name: player.name, at: Date.now() };
      room.buzzes.push(buzz);
      player.buzzedAt = buzz.at;
      touch(room);
    }
    sendJson(res, 200, { room: publicRoom(room) });
    return;
  }

  if (pathname === "/api/score") {
    const player = room.players[body.playerId];
    const delta = Number(body.delta);
    if (!player || !Number.isFinite(delta)) return sendJson(res, 400, { error: "Puntaje invalido" });
    player.score += delta;
    room.buzzes = room.buzzes.filter(item => item.playerId !== player.id);
    player.buzzedAt = null;
    touch(room);
    sendJson(res, 200, { room: publicRoom(room) });
    return;
  }

  if (pathname === "/api/clear-buzzes") {
    room.buzzes = [];
    for (const player of Object.values(room.players)) player.buzzedAt = null;
    touch(room);
    sendJson(res, 200, { room: publicRoom(room) });
    return;
  }

  if (pathname === "/api/round") {
    room.round = body.round || null;
    const clipSeconds = Number(body.clipSeconds);
    if (Number.isFinite(clipSeconds)) {
      room.clipSeconds = Math.min(20, Math.max(1, clipSeconds));
    }
    if (typeof body.playlistName === "string") room.playlistName = body.playlistName.slice(0, 80);
    if (body.clearBuzzes !== false) {
      room.buzzes = [];
      for (const player of Object.values(room.players)) player.buzzedAt = null;
    }
    touch(room);
    sendJson(res, 200, { room: publicRoom(room) });
    return;
  }

  if (pathname === "/api/reset") {
    room.players = {};
    room.buzzes = [];
    room.round = null;
    room.playlistName = "";
    touch(room);
    sendJson(res, 200, { room: publicRoom(room) });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/spotify/callback") {
    finishSpotifyLogin(req, res, url.searchParams).catch(error => {
      const origin = originFromRequest(req);
      sendRedirect(res, `${origin}/?spotify=error&message=${encodeURIComponent(error.message)}`);
    });
    return;
  }
  if (url.pathname === "/events" || url.pathname.startsWith("/api/")) {
    handleApi(req, res, url.pathname, url.searchParams).catch(error => {
      sendJson(res, 500, { error: error.message });
    });
    return;
  }
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`En Una Nota listo en http://localhost:${PORT}`);
  for (const address of localAddresses()) {
    console.log(`Telefono en la misma red: http://${address}:${PORT}/player`);
  }
});
