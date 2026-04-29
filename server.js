const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const PUBLIC_URL = process.env.PUBLIC_URL || "";

const rooms = new Map();
const clients = new Map();

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
  const route = pathname === "/" ? "/index.html" : pathname === "/player" ? "/player.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, route));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-store"
    });
    res.end(data);
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
    const origin = req.headers["x-forwarded-host"]
      ? `${req.headers["x-forwarded-proto"] || "https"}://${req.headers["x-forwarded-host"]}`
      : `http://${req.headers.host}`;
    sendJson(res, 200, {
      port: PORT,
      origin: PUBLIC_URL || origin,
      addresses: localAddresses(),
      room: publicRoom(room)
    });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const body = await readBody(req);

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
