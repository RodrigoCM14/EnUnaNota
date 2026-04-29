const $ = selector => document.querySelector(selector);

const DEFAULT_SPOTIFY_CLIENT_ID = "8791a946e68c476cac41c3d5023a86a7";

const elements = {
  clientId: $("#clientId"),
  playlistUrl: $("#playlistUrl"),
  clipSeconds: $("#clipSeconds"),
  roomId: $("#roomId"),
  connectSpotify: $("#connectSpotify"),
  activateScreenPlayer: $("#activateScreenPlayer"),
  disconnectSpotify: $("#disconnectSpotify"),
  loadPlaylist: $("#loadPlaylist"),
  playRound: $("#playRound"),
  revealAnswer: $("#revealAnswer"),
  clearBuzzes: $("#clearBuzzes"),
  resetGame: $("#resetGame"),
  copyJoinUrl: $("#copyJoinUrl"),
  spotifyStatus: $("#spotifyStatus"),
  joinUrl: $("#joinUrl"),
  answerPanel: $("#answerPanel"),
  cover: $("#cover"),
  roundLabel: $("#roundLabel"),
  trackTitle: $("#trackTitle"),
  trackArtist: $("#trackArtist"),
  roundTimer: $("#roundTimer"),
  roundProgress: $("#roundProgress"),
  buzzList: $("#buzzList"),
  scoreboard: $("#scoreboard")
};

let accessToken = localStorage.getItem("spotify_access_token") || "";
let refreshToken = localStorage.getItem("spotify_refresh_token") || "";
let tokenExpiresAt = Number(localStorage.getItem("spotify_expires_at") || 0);
let spotifyPlayer = null;
let spotifyDeviceId = "";
let externalDeviceId = "";
let activePlaybackDeviceId = "";
let playlistTracks = [];
let answerVisible = false;
let eventSource = null;
let state = null;
let phoneBaseUrl = "";
let timerId = null;

function canonicalHostUrl() {
  const url = new URL(location.href);
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  if (url.hostname.endsWith(".onrender.com")) url.protocol = "https:";
  return url;
}

function room() {
  return elements.roomId.value.trim() || "default";
}

function api(path, body) {
  return fetch(`${path}?room=${encodeURIComponent(room())}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  }).then(response => response.json());
}

function setStatus(text) {
  elements.spotifyStatus.textContent = text;
}

function spotifyClientId() {
  return elements.clientId.value.trim() || DEFAULT_SPOTIFY_CLIENT_ID;
}

function spotifyRedirectUri() {
  const url = canonicalHostUrl();
  url.search = "";
  url.hash = "";
  return url.origin + url.pathname;
}

function updateJoinUrl() {
  const base = phoneBaseUrl || location.origin;
  const url = new URL("/player", base);
  url.searchParams.set("room", room());
  elements.joinUrl.textContent = url.href;
}

async function copyJoinUrl() {
  const text = elements.joinUrl.textContent;
  await navigator.clipboard.writeText(text);
  const previous = elements.copyJoinUrl.textContent;
  elements.copyJoinUrl.textContent = "Copiado";
  window.setTimeout(() => {
    elements.copyJoinUrl.textContent = previous;
  }, 1200);
}

async function loadServerInfo() {
  const response = await fetch("/api/info");
  const info = await response.json();
  const localHost = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
  if (!localHost && info.origin) {
    phoneBaseUrl = info.origin;
  } else if (info.addresses?.length) {
    phoneBaseUrl = `http://${info.addresses[0]}:${info.port}`;
  }
  updateJoinUrl();
}

async function connectSpotify() {
  if (location.hostname.endsWith(".onrender.com") && location.protocol !== "https:") {
    const url = canonicalHostUrl();
    location.replace(url.href);
    return;
  }
  if (location.hostname === "localhost") {
    const url = canonicalHostUrl();
    url.searchParams.set("connect", "spotify");
    location.replace(url.href);
    return;
  }
  const clientId = spotifyClientId();
  if (!clientId) {
    setStatus("Agrega tu Client ID de Spotify");
    return;
  }
  localStorage.setItem("spotify_client_id", clientId);
  const url = new URL("/api/spotify-login", location.origin);
  url.searchParams.set("client_id", clientId);
  setStatus("Abriendo login de Spotify...");
  location.assign(url.href);
}

async function disconnectSpotify() {
  await fetch("/api/spotify-logout", { method: "POST" });
  localStorage.removeItem("spotify_access_token");
  localStorage.removeItem("spotify_refresh_token");
  localStorage.removeItem("spotify_expires_at");
  accessToken = "";
  refreshToken = "";
  tokenExpiresAt = 0;
  spotifyDeviceId = "";
  activePlaybackDeviceId = "";
  spotifyPlayer?.disconnect?.();
  spotifyPlayer = null;
  setStatus("Spotify desconectado");
}

function saveToken(token) {
  accessToken = token.access_token || accessToken;
  refreshToken = token.refresh_token || refreshToken;
  tokenExpiresAt = Date.now() + Number(token.expires_in || 3600) * 1000;
  localStorage.setItem("spotify_access_token", accessToken);
  localStorage.setItem("spotify_expires_at", String(tokenExpiresAt));
  if (refreshToken) localStorage.setItem("spotify_refresh_token", refreshToken);
}

async function spotifyToken(body) {
  const response = await fetch("/api/spotify-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const token = await response.json().catch(() => ({ error: "Respuesta invalida del servidor" }));
  return { response, token };
}

async function finishAuth() {
  const params = new URLSearchParams(location.search);
  const spotifyResult = params.get("spotify");
  if (spotifyResult === "connected") {
    history.replaceState({}, "", location.pathname);
    setStatus("Spotify conectado. Carga una playlist para iniciar el reproductor.");
    return;
  }
  if (spotifyResult === "error") {
    const message = params.get("message") || "No se pudo conectar Spotify";
    history.replaceState({}, "", location.pathname);
    setStatus(`Spotify: ${message}`);
    return;
  }
  const authError = params.get("error");
  if (authError) {
    const description = params.get("error_description");
    setStatus(description || `Spotify devolvio error: ${authError}`);
    history.replaceState({}, "", location.pathname);
    return;
  }
  const code = params.get("code");
  if (!code) return;
  const stateParam = params.get("state") || "";
  const clientId = localStorage.getItem("spotify_client_id") || spotifyClientId();
  const storedState = localStorage.getItem("spotify_auth_state") || "";
  const verifier = localStorage.getItem("spotify_code_verifier") || "";
  if (storedState && stateParam && storedState !== stateParam) {
    setStatus("Spotify devolvio una sesion distinta. Conecta otra vez.");
    history.replaceState({}, "", location.pathname);
    return;
  }
  const redirectUri = spotifyRedirectUri();
  const { response, token } = await spotifyToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
    state: stateParam
  });
  history.replaceState({}, "", location.pathname);
  if (!response.ok || !token.access_token) {
    const detail = token.error_description || token.error || "No se pudo conectar Spotify";
    setStatus(`Spotify token ${response.status}: ${detail}`);
    return;
  }
  saveToken(token);
  localStorage.removeItem("spotify_code_verifier");
  localStorage.removeItem("spotify_auth_state");
  setStatus("Spotify conectado");
}

async function refreshSpotifyToken() {
  const response = await fetch("/api/spotify-session");
  const session = await response.json().catch(() => ({ connected: false }));
  if (!response.ok || !session.connected || !session.accessToken) {
    return false;
  }
  accessToken = session.accessToken;
  tokenExpiresAt = Number(session.expiresAt || Date.now() + 3600 * 1000);
  localStorage.setItem("spotify_access_token", accessToken);
  localStorage.setItem("spotify_expires_at", String(tokenExpiresAt));
  setStatus(session.scope ? `Spotify conectado (${session.scope})` : "Spotify conectado");
  return true;
}

function validToken() {
  return accessToken && Date.now() < tokenExpiresAt - 30_000;
}

async function spotify(path, options = {}) {
  if (!validToken()) await refreshSpotifyToken();
  if (!validToken()) throw new Error("Conecta Spotify otra vez");
  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error?.message || response.statusText || "Error de Spotify";
    throw new Error(`Spotify API ${response.status}: ${message}`);
  }
  return data;
}

function waitForSpotifySdk() {
  return new Promise(resolve => {
    if (window.Spotify) return resolve();
    window.onSpotifyWebPlaybackSDKReady = resolve;
  });
}

function waitForScreenDevice(timeoutMs = 8000) {
  if (spotifyDeviceId) return Promise.resolve(spotifyDeviceId);
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      if (spotifyDeviceId) {
        window.clearInterval(intervalId);
        resolve(spotifyDeviceId);
      } else if (Date.now() - startedAt > timeoutMs) {
        window.clearInterval(intervalId);
        reject(new Error("Spotify no registro esta pantalla como dispositivo"));
      }
    }, 150);
  });
}

async function initPlayer(activate = false) {
  if (spotifyPlayer || !validToken()) return;
  setStatus("Spotify autorizado, iniciando reproductor...");
  await Promise.race([
    waitForSpotifySdk(),
    new Promise((_, reject) => window.setTimeout(() => reject(new Error("No se pudo cargar Spotify Web Playback SDK")), 8000))
  ]);
  spotifyPlayer = new Spotify.Player({
    name: "En Una Nota",
    getOAuthToken: cb => cb(accessToken),
    volume: 0.8
  });
  spotifyPlayer.addListener("ready", ({ device_id }) => {
    spotifyDeviceId = device_id;
    setStatus("Spotify listo para jugar");
  });
  spotifyPlayer.addListener("not_ready", () => setStatus("Spotify desconectado"));
  spotifyPlayer.addListener("account_error", () => setStatus("Spotify Premium requerido"));
  spotifyPlayer.addListener("playback_error", error => setStatus(error.message || "Error de reproduccion"));
  if (activate) spotifyPlayer.activateElement?.();
  const connected = await spotifyPlayer.connect();
  if (!connected) throw new Error("Spotify no pudo conectar el reproductor web");
  await waitForScreenDevice();
}

async function activateScreenPlayer() {
  if (!validToken()) await refreshSpotifyToken();
  if (!validToken()) {
    setStatus("Conecta Spotify primero");
    return;
  }
  await initPlayer(true);
  if (!spotifyPlayer || !spotifyDeviceId) {
    setStatus("El reproductor de esta pantalla aun no esta listo");
    return;
  }
  spotifyPlayer.activateElement?.();
  await spotify("/me/player", {
    method: "PUT",
    body: JSON.stringify({ device_ids: [spotifyDeviceId], play: false })
  });
  externalDeviceId = "";
  activePlaybackDeviceId = spotifyDeviceId;
  setStatus("Esta pantalla quedo activa para reproducir");
}

async function findSpotifyDevice() {
  if (activePlaybackDeviceId) return activePlaybackDeviceId;
  if (spotifyDeviceId) {
    activePlaybackDeviceId = spotifyDeviceId;
    return spotifyDeviceId;
  }
  const data = await spotify("/me/player/devices");
  const devices = data?.devices || [];
  const active = devices.find(device => device.is_active);
  const usable = active || devices[0];
  if (usable?.id) {
    externalDeviceId = usable.id;
    activePlaybackDeviceId = usable.id;
    setStatus(`Spotify listo en ${usable.name}`);
    return externalDeviceId;
  }
  return "";
}

function playlistIdFromUrl(value) {
  const trimmed = value.trim();
  if (/^[a-zA-Z0-9]{20,}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/playlist\/([a-zA-Z0-9]+)/);
  return match?.[1] || "";
}

async function loadPlaylist() {
  const id = playlistIdFromUrl(elements.playlistUrl.value);
  if (!id) {
    setStatus("Pega una URL de playlist valida");
    return;
  }
  localStorage.setItem("spotify_playlist_url", elements.playlistUrl.value);
  const response = await fetch(`/api/spotify-playlist?id=${encodeURIComponent(id)}`);
  const playlist = await response.json().catch(() => ({ error: "Respuesta invalida del servidor" }));
  if (!response.ok) {
    const endpoint = playlist.endpoint ? ` (${playlist.endpoint})` : "";
    const owner = playlist.owner?.id ? ` Dueno: ${playlist.owner.id}. Tu usuario: ${playlist.currentUserId || "desconocido"}.` : "";
    throw new Error(`Spotify playlist ${response.status}: ${playlist.error || "Forbidden"}${owner}${endpoint}`);
  }
  playlistTracks = playlist.tracks || [];
  await api("/api/round", { round: null, playlistName: playlist.name || "Playlist", clipSeconds: Number(elements.clipSeconds.value) });
  if (!playlistTracks.length && playlist.summary) {
    setStatus(`0 canciones. Items: ${playlist.summary.items}, tracks: ${playlist.summary.playableTracks}, no tracks: ${playlist.summary.nonTracks}`);
    return;
  }
  setStatus(`${playlistTracks.length} canciones cargadas. Reproduce una ronda para iniciar Spotify.`);
}

async function playRound() {
  await initPlayer().catch(error => setStatus(error.message));
  const deviceId = spotifyDeviceId || await findSpotifyDevice();
  if (!deviceId) {
    setStatus("Abre Spotify en algun dispositivo y presiona reproducir otra vez.");
    return;
  }
  if (!playlistTracks.length) {
    setStatus("Carga una playlist primero");
    return;
  }
  const track = playlistTracks[Math.floor(Math.random() * playlistTracks.length)];
  const clipSeconds = Number(elements.clipSeconds.value || 5);
  const positionMs = 0;
  answerVisible = false;
  activePlaybackDeviceId = deviceId;
  await spotify(`/me/player/play?device_id=${deviceId}`, {
    method: "PUT",
    body: JSON.stringify({ uris: [track.uri], position_ms: positionMs })
  });
  window.setTimeout(() => {
    spotify("/me/player/pause", { method: "PUT" }).catch(() => {});
  }, clipSeconds * 1000);
  await api("/api/round", {
    clipSeconds,
    playlistName: state?.playlistName || "",
    round: {
      track: {
        name: track.name,
        artists: track.artists.map(artist => artist.name).join(", "),
        image: track.album?.images?.[0]?.url || "",
        uri: track.uri
      },
      positionMs,
      startedAt: Date.now(),
      revealed: false
    }
  });
}

async function replayRound() {
  const round = state?.round;
  if (!round?.track?.uri) {
    setStatus("No hay fragmento para repetir");
    return;
  }
  const deviceId = activePlaybackDeviceId || spotifyDeviceId || await findSpotifyDevice();
  if (!deviceId) {
    setStatus("Abre Spotify en algun dispositivo y presiona reproducir otra vez.");
    return;
  }
  const clipSeconds = Number(elements.clipSeconds.value || state.clipSeconds || 5);
  answerVisible = false;
  activePlaybackDeviceId = deviceId;
  await spotify(`/me/player/play?device_id=${deviceId}`, {
    method: "PUT",
    body: JSON.stringify({ uris: [round.track.uri], position_ms: round.positionMs || 0 })
  });
  window.setTimeout(() => {
    spotify("/me/player/pause", { method: "PUT" }).catch(() => {});
  }, clipSeconds * 1000);
  await api("/api/round", {
    clipSeconds,
    playlistName: state?.playlistName || "",
    clearBuzzes: false,
    round: { ...round, startedAt: Date.now(), revealed: false }
  });
}

async function revealAnswer() {
  answerVisible = true;
  render();
  if (state?.round) {
    await api("/api/round", {
      round: { ...state.round, revealed: true },
      clipSeconds: Number(elements.clipSeconds.value),
      clearBuzzes: false
    });
  }
}

function updateRoundMeter() {
  const round = state?.round;
  if (!round || round.revealed) {
    elements.roundTimer.textContent = round?.revealed ? "Respuesta" : "--";
    elements.roundProgress.style.width = "0%";
    return;
  }
  const total = Number(state.clipSeconds || elements.clipSeconds.value || 5) * 1000;
  const elapsed = Date.now() - round.startedAt;
  const remaining = Math.max(0, total - elapsed);
  const progress = Math.min(100, Math.max(0, (elapsed / total) * 100));
  elements.roundTimer.textContent = `${Math.ceil(remaining / 1000)}s`;
  elements.roundProgress.style.width = `${progress}%`;
}

function render() {
  if (!state) return;
  const round = state.round;
  const showAnswer = answerVisible || round?.revealed;
  elements.answerPanel.classList.toggle("hidden", !showAnswer || !round);
  elements.cover.src = showAnswer && round?.track?.image ? round.track.image : "";
  elements.roundLabel.textContent = state.playlistName || "Ronda lista";
  elements.trackTitle.textContent = showAnswer && round ? round.track.name : round ? "Adivina la cancion" : "Carga una playlist y empieza";
  elements.trackArtist.textContent = showAnswer && round ? round.track.artists : "La respuesta se mantiene oculta hasta que la muestres.";
  updateRoundMeter();

  elements.buzzList.innerHTML = "";
  for (const buzz of state.buzzes) {
    const li = document.createElement("li");
    li.className = "buzz-item";
    li.innerHTML = `<strong>${buzz.name}</strong><button data-score="1" data-player="${buzz.playerId}">Correcto +1</button><button data-score="-1" data-player="${buzz.playerId}">Fallo -1</button>`;
    elements.buzzList.append(li);
  }
  if (!state.buzzes.length) {
    const li = document.createElement("li");
    li.textContent = "Nadie ha presionado todavia.";
    elements.buzzList.append(li);
  }

  elements.scoreboard.innerHTML = "";
  for (const player of state.players) {
    const row = document.createElement("div");
    row.className = "score-row";
    row.innerHTML = `<strong>${player.name}</strong><span class="score">${player.score}</span><span>pts</span>`;
    elements.scoreboard.append(row);
  }
  if (!state.players.length) {
    elements.scoreboard.innerHTML = `<p class="muted">Esperando jugadores...</p>`;
  }
}

function connectEvents() {
  eventSource?.close();
  eventSource = new EventSource(`/events?room=${encodeURIComponent(room())}`);
  eventSource.onmessage = event => {
    state = JSON.parse(event.data);
    render();
  };
}

elements.connectSpotify.addEventListener("click", () => connectSpotify().catch(error => setStatus(error.message || "No se pudo abrir Spotify")));
elements.activateScreenPlayer.addEventListener("click", () => activateScreenPlayer().catch(error => setStatus(error.message || "No se pudo activar esta pantalla")));
elements.disconnectSpotify.addEventListener("click", () => disconnectSpotify().catch(error => setStatus(error.message || "No se pudo desconectar Spotify")));
elements.loadPlaylist.addEventListener("click", () => loadPlaylist().catch(error => setStatus(error.message)));
elements.playRound.addEventListener("click", () => playRound().catch(error => setStatus(error.message)));
elements.replayRound.addEventListener("click", () => replayRound().catch(error => setStatus(error.message)));
elements.revealAnswer.addEventListener("click", () => revealAnswer().catch(error => setStatus(error.message)));
elements.clearBuzzes.addEventListener("click", () => api("/api/clear-buzzes"));
elements.resetGame.addEventListener("click", () => confirm("Reiniciar jugadores y puntajes?") && api("/api/reset"));
elements.copyJoinUrl.addEventListener("click", () => copyJoinUrl().catch(() => setStatus("No se pudo copiar el enlace")));
elements.roomId.addEventListener("change", () => {
  localStorage.setItem("room_id", room());
  updateJoinUrl();
  connectEvents();
});
elements.buzzList.addEventListener("click", event => {
  const button = event.target.closest("button[data-player]");
  if (!button) return;
  api("/api/score", { playerId: button.dataset.player, delta: Number(button.dataset.score) });
});

elements.clientId.value = localStorage.getItem("spotify_client_id") || "";
if (!elements.clientId.value) elements.clientId.value = DEFAULT_SPOTIFY_CLIENT_ID;
localStorage.setItem("spotify_client_id", elements.clientId.value);
elements.playlistUrl.value = localStorage.getItem("spotify_playlist_url") || "";
elements.roomId.value = localStorage.getItem("room_id") || new URLSearchParams(location.search).get("room") || "default";
finishAuth()
  .then(async () => {
    const serverSession = await refreshSpotifyToken();
    if (!serverSession && validToken()) setStatus("Spotify conectado");
    const params = new URLSearchParams(location.search);
    if (validToken()) {
      sessionStorage.removeItem("spotify_auto_connect_attempted");
    } else if (params.get("connect") === "spotify" && !params.has("code") && !params.has("error") && !sessionStorage.getItem("spotify_auto_connect_attempted")) {
      sessionStorage.setItem("spotify_auto_connect_attempted", "1");
      history.replaceState({}, "", location.pathname);
      await connectSpotify();
    }
  })
  .catch(error => setStatus(error.message));
updateJoinUrl();
loadServerInfo().catch(() => {});
connectEvents();
timerId = window.setInterval(updateRoundMeter, 250);
