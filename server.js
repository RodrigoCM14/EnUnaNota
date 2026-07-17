const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const PUBLIC_URL = process.env.PUBLIC_URL || "";
const DEFAULT_SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "8791a946e68c476cac41c3d5023a86a7";
const POINT_TARGET = 10;
const HOST_LEASE_MS = 45_000;
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
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function createRoomId() {
  let id = "";
  do {
    const bytes = crypto.randomBytes(6);
    id = Array.from(bytes, byte => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join("");
  } while (rooms.has(id));
  return id;
}

function createHostToken() {
  return crypto.randomBytes(24).toString("hex");
}

function tokensMatch(expected, received) {
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(String(expected));
  const receivedBuffer = Buffer.from(String(received));
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

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
      hostToken: createHostToken(),
      hostPlayerId: "",
      hostLastSeen: 0,
      players: {},
      buzzes: [],
      round: null,
      roundNumber: 0,
      clipSeconds: 10,
      playlistName: "",
      playlistId: "",
      playlistOptions: [],
      pointTarget: POINT_TARGET,
      goldenGoal: false,
      goldenVote: null,
      winner: null,
      gameOver: false,
      hostCommand: null,
      updatedAt: Date.now()
    });
  }
  return rooms.get(id);
}

function publicRoom(room) {
  return {
    id: room.id,
    hostPlayerId: room.hostPlayerId || "",
    players: Object.values(room.players).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
    buzzes: room.buzzes,
    round: room.round,
    roundNumber: room.roundNumber,
    clipSeconds: room.clipSeconds,
    playlistName: room.playlistName,
    playlistId: room.playlistId || "",
    playlistOptions: room.playlistOptions || [],
    pointTarget: room.pointTarget,
    goldenGoal: room.goldenGoal,
    goldenVote: goldenVoteSummary(room),
    winner: room.winner,
    gameOver: room.gameOver,
    hostCommand: room.hostCommand,
    updatedAt: room.updatedAt
  };
}

function sessionResponse(room, resumed = false) {
  return {
    room: publicRoom(room),
    roomId: room.id,
    hostToken: room.hostToken,
    resumed
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

function clearBuzzes(room) {
  room.buzzes = [];
  for (const player of Object.values(room.players)) player.buzzedAt = null;
}

function resetScores(room) {
  for (const player of Object.values(room.players)) {
    player.score = 0;
    player.buzzedAt = null;
  }
}

function goldenVoteRequired(room) {
  return Math.ceil(Object.keys(room.players).length * 0.51);
}

function goldenVoteSummary(room) {
  const vote = room.goldenVote;
  if (!vote) return null;
  const votes = vote.votes || {};
  const yes = Object.values(votes).filter(Boolean).length;
  const no = Object.values(votes).filter(value => value === false).length;
  const total = Object.keys(room.players).length;
  return { ...vote, yes, no, total, required: goldenVoteRequired(room) };
}

function activateGoldenGoal(room) {
  resetScores(room);
  clearBuzzes(room);
  room.winner = null;
  room.gameOver = false;
  room.goldenGoal = true;
  room.goldenVote = {
    id: crypto.randomUUID(),
    active: false,
    approved: true,
    rejected: false,
    votes: {},
    createdAt: Date.now(),
    resolvedAt: Date.now()
  };
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

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  const resolved = (PUBLIC_URL || origin).replace(/^http:\/\/(.+\.onrender\.com)$/i, "https://$1");
  try {
    const url = new URL(resolved);
    if (url.hostname === "localhost" || url.hostname === "[::1]" || url.hostname === "::1") {
      url.hostname = "127.0.0.1";
    }
    return url.origin;
  } catch {
    return resolved;
  }
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
    "SameSite=Lax"
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
  session.scope = token.scope || session.scope || "";
}

function normalizeSpotifyTrack(item) {
  const track = item?.item || item?.track || item;
  if (!track || track.type !== "track" || !track.uri) return null;
  return {
    name: track.name || "Cancion sin titulo",
    uri: track.uri,
    type: track.type,
    duration_ms: Number(track.duration_ms || 0),
    artists: Array.isArray(track.artists) ? track.artists.map(artist => ({ name: artist.name || "" })) : [],
    album: {
      images: Array.isArray(track.album?.images)
        ? track.album.images.map(image => ({ url: image.url || "" })).filter(image => image.url)
        : []
    }
  };
}

async function collectPlaylistTracks(session, firstUrl) {
  let url = firstUrl;
  const tracks = [];
  const summary = { pages: 0, items: 0, nullTracks: 0, nonTracks: 0, playableTracks: 0 };
  while (url) {
    summary.pages += 1;
    const page = await spotifyApi(session, url);
    if (!page.ok) return { ok: false, status: page.status, data: page.data, endpoint: url, tracks, summary, attempts: page.attempts };
    for (const item of page.data.items || []) {
      summary.items += 1;
      if (!item?.track && !item?.uri) summary.nullTracks += 1;
      const track = normalizeSpotifyTrack(item);
      if (track) {
        summary.playableTracks += 1;
        tracks.push(track);
      } else {
        summary.nonTracks += 1;
      }
    }
    url = page.data.next ? page.data.next.replace("https://api.spotify.com/v1", "") : "";
  }
  return { ok: true, tracks, summary };
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

async function spotifyApi(session, spotifyPath, options = {}) {
  const refreshed = await refreshSpotifySession(session);
  if (!refreshed) {
    return { ok: false, status: 401, data: { error: { message: "Sesion Spotify no conectada" } } };
  }
  const maxAttempts = Number(options.retries || 3);
  let lastResult = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response;
    try {
      response = await fetch(`https://api.spotify.com/v1${spotifyPath}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json",
          ...(options.headers || {})
        }
      });
    } catch (error) {
      lastResult = { ok: false, status: 502, data: { error: { message: error.message || "No se pudo contactar Spotify" } }, attempts: attempt };
      if (attempt < maxAttempts) await wait(350 * attempt);
      continue;
    }
    const data = response.status === 204 ? null : await response.json().catch(() => ({
      error: { message: response.statusText || "Respuesta invalida de Spotify" }
    }));
    lastResult = { ok: response.ok, status: response.status, data, attempts: attempt };
    if (response.ok) return lastResult;
    const retryable = response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504;
    if (!retryable || attempt >= maxAttempts) return lastResult;
    const retryAfter = Number(response.headers.get("retry-after") || 0);
    await wait(retryAfter > 0 ? retryAfter * 1000 : 450 * attempt);
  }
  return lastResult || { ok: false, status: 502, data: { error: { message: "Spotify no respondio" } }, attempts: 0 };
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
  if (req.method === "POST" && pathname === "/api/session") {
    const body = await readBody(req);
    const requestedRoomId = String(body.roomId || "").trim().toUpperCase();
    const requestedHostToken = String(body.hostToken || "");
    const existingRoom = requestedRoomId ? rooms.get(requestedRoomId) : null;
    if (existingRoom && tokensMatch(existingRoom.hostToken, requestedHostToken)) {
      sendJson(res, 200, sessionResponse(existingRoom, true));
      return;
    }
    const room = getRoom(createRoomId());
    sendJson(res, 201, sessionResponse(room));
    return;
  }

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
      scope: current?.session?.scope || "",
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
      expiresAt: current.session.expiresAt,
      scope: current.session.scope || ""
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/spotify-playlists") {
    const current = getSpotifySession(req);
    if (!current) return sendJson(res, 401, { error: "Spotify no conectado" });
    const profile = await spotifyApi(current.session, "/me");
    if (!profile.ok) {
      return sendJson(res, profile.status, {
        error: profile.data?.error?.message || "No se pudo leer el usuario conectado",
        endpoint: "/me",
        attempts: profile.attempts,
        spotify: profile.data
      });
    }
    const currentUserId = profile.data?.id || "";
    const playlists = [];
    let url = "/me/playlists?limit=50";
    while (url && playlists.length < 100) {
      const page = await spotifyApi(current.session, url);
      if (!page.ok) {
        return sendJson(res, page.status, {
          error: page.data?.error?.message || "No se pudieron listar playlists",
          endpoint: url,
          attempts: page.attempts,
          spotify: page.data
        });
      }
      for (const item of page.data?.items || []) {
        if (!item?.id) continue;
        if (item.owner?.id !== currentUserId) continue;
        playlists.push({
          id: item.id,
          name: item.name || "Playlist",
          owner: item.owner?.display_name || item.owner?.id || "",
          image: item.images?.[0]?.url || "",
          tracks: Number(item.tracks?.total || 0)
        });
      }
      url = page.data?.next ? page.data.next.replace("https://api.spotify.com/v1", "") : "";
    }
    sendJson(res, 200, { playlists });
    return;
  }

  if (req.method === "GET" && pathname === "/api/spotify-playlist") {
    const current = getSpotifySession(req);
    if (!current) return sendJson(res, 401, { error: "Spotify no conectado" });
    const playlistId = String(searchParams.get("id") || "").trim();
    if (!/^[a-zA-Z0-9]{20,}$/.test(playlistId)) return sendJson(res, 400, { error: "Playlist ID invalido" });

    const profile = await spotifyApi(current.session, "/me");
    const currentUserId = profile.ok ? profile.data?.id || "" : "";
    const playlist = await spotifyApi(current.session, `/playlists/${playlistId}?fields=name,owner(id,display_name),collaborative,public`);
    if (!playlist.ok) {
      return sendJson(res, playlist.status, {
        error: playlist.data?.error?.message || "No se pudo leer la playlist",
        endpoint: `/playlists/${playlistId}?fields=name`,
        attempts: playlist.attempts,
        spotify: playlist.data
      });
    }

    const primaryUrl = `/playlists/${playlistId}/items?limit=50`;
    const collected = await collectPlaylistTracks(current.session, primaryUrl);
    if (!collected.ok) {
      return sendJson(res, collected.status, {
        error: collected.data?.error?.message || "No se pudieron leer las canciones. En Development Mode, Spotify solo permite este endpoint para playlists propias o colaborativas y para usuarios autorizados en la app.",
        endpoint: collected.endpoint || primaryUrl,
        attempts: collected.attempts,
        owner: playlist.data?.owner || null,
        currentUserId,
        collaborative: Boolean(playlist.data?.collaborative),
        public: playlist.data?.public,
        spotify: collected.data
      });
    }

    sendJson(res, 200, { name: playlist.data.name || "Playlist", tracks: collected.tracks, summary: collected.summary });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const body = await readBody(req);

  if (pathname === "/api/spotify-token") {
    const tokenBody = new URLSearchParams();
    for (const [key, value] of Object.entries(body || {})) {
      if (value !== undefined && value !== null && value !== "") tokenBody.set(key, String(value));
    }
    const result = await requestSpotifyToken(tokenBody);
    sendJson(res, result.status, result.token);
    return;
  }

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
    const wantsHost = Boolean(body.isHost);
    const normalizedName = name.toLocaleLowerCase();
    const duplicate = Object.values(room.players).find(player =>
      player.id !== id && player.name.trim().toLocaleLowerCase() === normalizedName
    );
    if (duplicate) return sendJson(res, 409, { error: "Ese nombre ya esta en uso" });
    const currentHostActive = room.hostPlayerId && Date.now() - room.hostLastSeen <= HOST_LEASE_MS;
    if (wantsHost && currentHostActive && room.hostPlayerId !== id) {
      return sendJson(res, 409, { error: "Ya hay un host en esta sala" });
    }
    if (wantsHost) {
      room.hostPlayerId = id;
      room.hostLastSeen = Date.now();
    }
    room.players[id] = room.players[id] || { id, name, score: 0, buzzedAt: null };
    room.players[id].name = name;
    touch(room);
    sendJson(res, 200, {
      player: room.players[id],
      isHost: wantsHost && room.hostPlayerId === id,
      room: publicRoom(room)
    });
    return;
  }

  if (pathname === "/api/buzz") {
    const player = room.players[body.playerId];
    if (!player) return sendJson(res, 404, { error: "Jugador no encontrado" });
    if (!room.round || room.round.revealed || room.round.acceptBuzzes === false) {
      return sendJson(res, 409, { error: "No hay una ronda activa" });
    }
    const eliminatedPlayerIds = Array.isArray(room.round.eliminatedPlayerIds) ? room.round.eliminatedPlayerIds : [];
    if (eliminatedPlayerIds.includes(player.id)) {
      return sendJson(res, 409, { error: "Ya fallaste esta ronda" });
    }
    if (!room.buzzes.some(item => item.playerId === player.id)) {
      const at = Date.now();
      const startedAt = Number(room.round.startedAt || at);
      const buzz = { playerId: player.id, name: player.name, at, elapsedMs: Math.max(0, at - startedAt) };
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
    if (delta > 0 && room.round) {
      room.round.revealed = true;
      room.round.hostReviewing = false;
      room.round.stoppedAt = room.round.stoppedAt || Date.now();
    }
    if (delta > 0 && !room.winner && (room.goldenGoal || player.score >= room.pointTarget)) {
      room.winner = { id: player.id, name: player.name, score: player.score };
      if (room.goldenGoal) room.goldenGoal = false;
      room.goldenVote = null;
      room.gameOver = true;
    }
    if (delta > 0) {
      room.buzzes = [];
      for (const participant of Object.values(room.players)) participant.buzzedAt = null;
    } else {
      if (room.round) {
        const eliminatedPlayerIds = Array.isArray(room.round.eliminatedPlayerIds) ? room.round.eliminatedPlayerIds : [];
        if (!eliminatedPlayerIds.includes(player.id)) eliminatedPlayerIds.push(player.id);
        room.round.eliminatedPlayerIds = eliminatedPlayerIds;
      }
      room.buzzes = room.buzzes.filter(item => item.playerId !== player.id);
      player.buzzedAt = null;
    }
    touch(room);
    sendJson(res, 200, { room: publicRoom(room) });
    return;
  }

  if (pathname === "/api/host-heartbeat") {
    const adminKey = String(body.adminKey || "");
    const hostPlayerId = String(body.playerId || "");
    const roomKeyMatches = adminKey.toUpperCase() === room.id.toUpperCase();
    const hostMatches = room.hostPlayerId === hostPlayerId;
    if (!roomKeyMatches || !hostMatches) {
      return sendJson(res, 403, { error: "Host no disponible" });
    }
    room.hostLastSeen = Date.now();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/host-command") {
    const adminKey = String(body.adminKey || "");
    const hostToken = String(body.hostToken || "");
    const hostPlayerId = String(body.hostPlayerId || "");
    const action = String(body.action || "");
    const roomKeyMatches = adminKey.toUpperCase() === room.id.toUpperCase();
    const desktopHost = tokensMatch(room.hostToken, hostToken);
    const mobileHost = roomKeyMatches && room.hostPlayerId === hostPlayerId && Date.now() - room.hostLastSeen <= HOST_LEASE_MS;
    if (!desktopHost && !mobileHost) {
      return sendJson(res, 403, { error: "Clave admin incorrecta" });
    }
    if (mobileHost) room.hostLastSeen = Date.now();
    if (!action) return sendJson(res, 400, { error: "Control invalido" });
    room.hostCommand = {
      id: crypto.randomUUID(),
      action,
      playerId: body.playerId || "",
      delta: Number(body.delta || 0),
      target: String(body.target || ""),
      createdAt: Date.now()
    };
    touch(room);
    sendJson(res, 200, { room: publicRoom(room) });
    return;
  }

  if (pathname === "/api/clear-buzzes") {
    clearBuzzes(room);
    touch(room);
    sendJson(res, 200, { room: publicRoom(room) });
    return;
  }

  if (pathname === "/api/golden-goal") {
    const hasEligiblePlayer = Object.values(room.players).some(player => player.score >= room.pointTarget - 1);
    if (!hasEligiblePlayer) return sendJson(res, 409, { error: "Buzz de Oro requiere un jugador con 9 puntos o mas" });
    if (!Object.keys(room.players).length) return sendJson(res, 409, { error: "No hay jugadores para votar" });
    if (room.gameOver) return sendJson(res, 409, { error: "La partida ya termino" });
    if (room.goldenGoal) return sendJson(res, 409, { error: "Buzz de Oro ya esta activo" });
    if (room.goldenVote?.active) return sendJson(res, 409, { error: "Ya hay una votacion activa" });
    room.goldenVote = {
      id: crypto.randomUUID(),
      active: true,
      approved: false,
      rejected: false,
      votes: {},
      createdAt: Date.now(),
      resolvedAt: null
    };
    touch(room);
    sendJson(res, 200, { room: publicRoom(room) });
    return;
  }

  if (pathname === "/api/golden-vote") {
    const vote = room.goldenVote;
    const player = room.players[body.playerId];
    if (!vote?.active) return sendJson(res, 409, { error: "No hay votacion activa" });
    if (!player) return sendJson(res, 404, { error: "Jugador no encontrado" });
    vote.votes[player.id] = Boolean(body.accept);
    const yes = Object.values(vote.votes).filter(Boolean).length;
    const no = Object.values(vote.votes).filter(value => value === false).length;
    const total = Object.keys(room.players).length;
    const required = goldenVoteRequired(room);
    if (yes >= required) {
      activateGoldenGoal(room);
    } else if (no > total - required) {
      vote.active = false;
      vote.rejected = true;
      vote.resolvedAt = Date.now();
    }
    touch(room);
    sendJson(res, 200, { room: publicRoom(room) });
    return;
  }

  if (pathname === "/api/reset-match" || pathname === "/api/continue-match") {
    resetScores(room);
    clearBuzzes(room);
    room.round = null;
    room.roundNumber = 0;
    room.goldenGoal = false;
    room.goldenVote = null;
    room.winner = null;
    room.gameOver = false;
    if (typeof body.playlistName === "string") room.playlistName = body.playlistName.slice(0, 80);
    if (typeof body.playlistId === "string") room.playlistId = body.playlistId.slice(0, 100);
    touch(room);
    sendJson(res, 200, { room: publicRoom(room) });
    return;
  }

  if (pathname === "/api/playlist-options") {
    if (!tokensMatch(room.hostToken, String(body.hostToken || ""))) {
      return sendJson(res, 403, { error: "Clave admin incorrecta" });
    }
    if (!Array.isArray(body.playlists)) return sendJson(res, 400, { error: "Playlists invalidas" });
    room.playlistOptions = body.playlists
      .filter(item => /^[a-zA-Z0-9]{20,}$/.test(String(item?.id || "")))
      .slice(0, 100)
      .map(item => ({
        id: String(item.id),
        name: String(item.name || "Playlist").slice(0, 80),
        tracks: Math.max(0, Number(item.tracks) || 0)
      }));
    touch(room);
    sendJson(res, 200, { room: publicRoom(room) });
    return;
  }

  if (pathname === "/api/round") {
    if (room.gameOver && body.round) return sendJson(res, 409, { error: "La partida termino. Continua o elige otra playlist." });
    if (room.goldenVote?.active && body.round) return sendJson(res, 409, { error: "Hay una votacion de Buzz de Oro activa" });
    if (body.incrementRound && body.round) room.roundNumber += 1;
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
    room.hostPlayerId = "";
    room.hostLastSeen = 0;
    room.buzzes = [];
    room.round = null;
    room.roundNumber = 0;
    room.playlistName = "";
    room.playlistId = "";
    room.playlistOptions = [];
    room.goldenGoal = false;
    room.goldenVote = null;
    room.winner = null;
    room.gameOver = false;
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
  console.log(`En Una Nota listo en http://127.0.0.1:${PORT}`);
  for (const address of localAddresses()) {
    console.log(`Telefono en la misma red: http://${address}:${PORT}/player`);
  }
});
