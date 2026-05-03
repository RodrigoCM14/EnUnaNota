const $ = selector => document.querySelector(selector);

const DEFAULT_SPOTIFY_CLIENT_ID = "8791a946e68c476cac41c3d5023a86a7";
const DEFAULT_CLIP_SECONDS = 10;

const elements = {
  clientId: $("#clientId"),
  playlistUrl: $("#playlistUrl"),
  roomId: $("#roomId"),
  connectSpotify: $("#connectSpotify"),
  activateScreenPlayer: $("#activateScreenPlayer"),
  disconnectSpotify: $("#disconnectSpotify"),
  loadPlaylist: $("#loadPlaylist"),
  refreshPlaylists: $("#refreshPlaylists"),
  playlistGrid: $("#playlistGrid"),
  playRound: $("#playRound"),
  replayRound: $("#replayRound"),
  revealAnswer: $("#revealAnswer"),
  continueSong: $("#continueSong"),
  goldenGoal: $("#goldenGoal"),
  clearBuzzes: $("#clearBuzzes"),
  resetGame: $("#resetGame"),
  copyJoinUrl: $("#copyJoinUrl"),
  spotifyStatus: $("#spotifyStatus"),
  spotifyStatusText: $("#spotifyStatusText"),
  joinUrl: $("#joinUrl"),
  joinQr: $("#joinQr"),
  playlistBanner: $("#playlistBanner"),
  answerPanel: $("#answerPanel"),
  cover: $("#cover"),
  roundLabel: $("#roundLabel"),
  trackTitle: $("#trackTitle"),
  trackArtist: $("#trackArtist"),
  roundTimer: $("#roundTimer"),
  roundProgress: $("#roundProgress"),
  buzzList: $("#buzzList"),
  scoreboard: $("#scoreboard"),
  winnerModal: $("#winnerModal"),
  winnerTitle: $("#winnerTitle"),
  winnerScore: $("#winnerScore"),
  closeWinnerModal: $("#closeWinnerModal"),
  continueWarning: $("#continueWarning"),
  rulesModal: $("#rulesModal"),
  closeRulesModal: $("#closeRulesModal")
};

localStorage.removeItem("spotify_access_token");
localStorage.removeItem("spotify_refresh_token");
localStorage.removeItem("spotify_expires_at");

let accessToken = "";
let refreshToken = "";
let tokenExpiresAt = 0;
let spotifyPlayer = null;
let spotifyDeviceId = "";
let externalDeviceId = "";
let activePlaybackDeviceId = "";
let playlistTracks = [];
let playedTrackUris = new Set(JSON.parse(localStorage.getItem("played_track_uris") || "[]"));
let answerVisible = false;
let eventSource = null;
let state = null;
let lastWinnerId = "";
let songContinuing = false;
let phoneBaseUrl = "";
let timerId = null;
let pausePlaybackTimeoutId = null;
let lastHostCommandId = "";
let connectAfterRules = false;
const PLAYBACK_START_DELAY_MS = 1000;

function canonicalHostUrl() {
  const url = new URL(location.href);
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  if (url.hostname.endsWith(".onrender.com")) url.protocol = "https:";
  return url;
}

function room() {
  return elements.roomId?.value?.trim() || "default";
}

function api(path, body) {
  return fetch(`${path}?room=${encodeURIComponent(room())}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  }).then(async response => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || `Error ${response.status}`);
    if (data.room) {
      state = data.room;
      render();
    }
    return data;
  });
}

function setStatus(text) {
  const disconnected = /sin conectar|desconectado|error|no se pudo|conecta spotify|premium requerido|pendiente/i.test(text);
  const connected = !disconnected && /conectado|listo|activa|cargad|repetido|mostrada|continuando|buzz de oro/i.test(text);
  elements.spotifyStatus.textContent = connected ? "\u2713" : "\u2715";
  elements.spotifyStatus.title = text;
  elements.spotifyStatus.setAttribute("aria-label", text);
  elements.spotifyStatus.classList.toggle("connected", connected);
  elements.spotifyStatus.classList.toggle("disconnected", !connected);
  elements.spotifyStatusText.textContent = text;
}

function spotifyClientId() {
  return elements.clientId?.value?.trim() || DEFAULT_SPOTIFY_CLIENT_ID;
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
  elements.joinQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(url.href)}`;
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
  if (pausePlaybackTimeoutId) window.clearTimeout(pausePlaybackTimeoutId);
  pausePlaybackTimeoutId = null;
  resetContinueButton();
  spotifyPlayer?.disconnect?.();
  spotifyPlayer = null;
  setStatus("Spotify desconectado");
}

async function forgetSpotifySessionOnFreshLoad() {
  const params = new URLSearchParams(location.search);
  if (params.get("spotify") || params.get("code") || params.get("error") || params.get("connect") === "spotify") return;
  await fetch("/api/spotify-logout", { method: "POST" }).catch(() => {});
  accessToken = "";
  refreshToken = "";
  tokenExpiresAt = 0;
  spotifyDeviceId = "";
  activePlaybackDeviceId = "";
  setStatus("Spotify sin conectar");
}

function saveToken(token) {
  accessToken = token.access_token || accessToken;
  refreshToken = token.refresh_token || refreshToken;
  tokenExpiresAt = Date.now() + Number(token.expires_in || 3600) * 1000;
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
    return "connected";
  }
  if (spotifyResult === "error") {
    const message = params.get("message") || "No se pudo conectar Spotify";
    history.replaceState({}, "", location.pathname);
    setStatus(`Spotify: ${message}`);
    return "error";
  }
  const authError = params.get("error");
  if (authError) {
    const description = params.get("error_description");
    setStatus(description || `Spotify devolvio error: ${authError}`);
    history.replaceState({}, "", location.pathname);
    return "error";
  }
  const code = params.get("code");
  if (!code) return "";
  const stateParam = params.get("state") || "";
  const clientId = localStorage.getItem("spotify_client_id") || spotifyClientId();
  const storedState = localStorage.getItem("spotify_auth_state") || "";
  const verifier = localStorage.getItem("spotify_code_verifier") || "";
  if (storedState && stateParam && storedState !== stateParam) {
    setStatus("Spotify devolvio una sesion distinta. Conecta otra vez.");
    history.replaceState({}, "", location.pathname);
    return "error";
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
    return "error";
  }
  saveToken(token);
  localStorage.removeItem("spotify_code_verifier");
  localStorage.removeItem("spotify_auth_state");
  setStatus("Spotify conectado");
  return "connected";
}

async function refreshSpotifyToken() {
  const response = await fetch("/api/spotify-session");
  const session = await response.json().catch(() => ({ connected: false }));
  if (!response.ok || !session.connected || !session.accessToken) {
    return false;
  }
  accessToken = session.accessToken;
  tokenExpiresAt = Number(session.expiresAt || Date.now() + 3600 * 1000);
  setStatus(session.scope ? `Spotify conectado (${session.scope})` : "Spotify conectado");
  return true;
}

function validToken() {
  return accessToken && Date.now() < tokenExpiresAt - 30_000;
}

function schedulePlaybackPause(clipSeconds) {
  if (pausePlaybackTimeoutId) window.clearTimeout(pausePlaybackTimeoutId);
  pausePlaybackTimeoutId = window.setTimeout(async () => {
    pausePlaybackTimeoutId = null;
    await spotify("/me/player/pause", { method: "PUT" }).catch(() => {});
    await markRoundStopped().catch(() => {});
  }, clipSeconds * 1000);
}

function wait(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function playRoundBeep() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  await context.resume();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.34, context.currentTime + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.44);
  window.setTimeout(() => context.close().catch(() => {}), 540);
}

function savePlayedTracks() {
  localStorage.setItem("played_track_uris", JSON.stringify([...playedTrackUris]));
}

function resetPlayedTracks() {
  playedTrackUris = new Set();
  savePlayedTracks();
}

function pickUnplayedTrack() {
  if (!playlistTracks.length) return null;
  let availableTracks = playlistTracks.filter(track => track?.uri && !playedTrackUris.has(track.uri));
  if (!availableTracks.length) {
    resetPlayedTracks();
    availableTracks = playlistTracks.filter(track => track?.uri);
    setStatus("Todas las canciones sonaron. Reiniciando lista.");
  }
  const track = availableTracks[Math.floor(Math.random() * availableTracks.length)];
  if (track?.uri) {
    playedTrackUris.add(track.uri);
    savePlayedTracks();
  }
  return track || null;
}

function resetContinueButton() {
  songContinuing = false;
  elements.continueSong.textContent = "Continuar";
  elements.continueSong.classList.remove("pause-mode");
  elements.continueWarning?.classList.add("hidden");
}

async function pausePlaybackForBuzz() {
  if (pausePlaybackTimeoutId) window.clearTimeout(pausePlaybackTimeoutId);
  pausePlaybackTimeoutId = null;
  resetContinueButton();
  await spotify("/me/player/pause", { method: "PUT" });
  await markRoundStopped();
  setStatus("Buzz recibido. Musica pausada");
}

async function stopPlaybackNow() {
  if (pausePlaybackTimeoutId) window.clearTimeout(pausePlaybackTimeoutId);
  pausePlaybackTimeoutId = null;
  resetContinueButton();
  await spotify("/me/player/pause", { method: "PUT" }).catch(() => {});
  await markRoundStopped().catch(() => {});
}

async function markRoundStopped() {
  if (!state?.round || state.round.revealed || state.round.stoppedAt) return;
  await api("/api/round", {
    round: { ...state.round, stoppedAt: Date.now() },
    clipSeconds: Number(state.clipSeconds || DEFAULT_CLIP_SECONDS),
    clearBuzzes: false
  });
}

function pauseOnNewBuzz(previousState, nextState) {
  if (!previousState || !nextState?.round || nextState.round.revealed) return;
  if ((nextState.buzzes?.length || 0) <= (previousState.buzzes?.length || 0)) return;
  pausePlaybackForBuzz().catch(() => {});
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
  const trimmed = String(value || "").trim();
  if (/^[a-zA-Z0-9]{20,}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/playlist\/([a-zA-Z0-9]+)/);
  return match?.[1] || "";
}

async function loadPlaylist(playlistValue = "") {
  const source = playlistValue || elements.playlistUrl?.value || localStorage.getItem("spotify_playlist_url") || "";
  const id = playlistIdFromUrl(source);
  if (!id) {
    setStatus("Elige una playlist valida");
    return;
  }
  localStorage.setItem("spotify_playlist_url", `https://open.spotify.com/playlist/${id}`);
  const response = await fetch(`/api/spotify-playlist?id=${encodeURIComponent(id)}`);
  const playlist = await response.json().catch(() => ({ error: "Respuesta invalida del servidor" }));
  if (!response.ok) {
    const endpoint = playlist.endpoint ? ` (${playlist.endpoint})` : "";
    const attempts = playlist.attempts ? ` Intentos: ${playlist.attempts}.` : "";
    const owner = playlist.owner?.id ? ` Dueno: ${playlist.owner.id}. Tu usuario: ${playlist.currentUserId || "desconocido"}.` : "";
    throw new Error(`Spotify playlist ${response.status}: ${playlist.error || "Forbidden"}.${attempts}${owner}${endpoint}`);
  }
  playlistTracks = playlist.tracks || [];
  resetPlayedTracks();
  await api("/api/reset-match", { playlistName: playlist.name || "Playlist" });
  if (!playlistTracks.length && playlist.summary) {
    setStatus(`0 canciones. Items: ${playlist.summary.items}, tracks: ${playlist.summary.playableTracks}, no tracks: ${playlist.summary.nonTracks}`);
    return;
  }
  setStatus(`${playlistTracks.length} canciones cargadas. Reproduce una ronda para iniciar Spotify.`);
}

async function loadUserPlaylists() {
  elements.playlistGrid.innerHTML = `<p class="muted">Cargando playlists...</p>`;
  const response = await fetch("/api/spotify-playlists");
  const data = await response.json().catch(() => ({ error: "Respuesta invalida del servidor" }));
  if (!response.ok) {
    throw new Error(`Spotify playlists ${response.status}: ${data.error || "No se pudieron cargar playlists"}`);
  }
  renderPlaylistPicker(data.playlists || []);
}

function renderPlaylistPicker(playlists) {
  elements.playlistGrid.innerHTML = "";
  if (!playlists.length) {
    elements.playlistGrid.innerHTML = `<p class="muted">No encontramos playlists en esta cuenta.</p>`;
    return;
  }
  for (const playlist of playlists) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "playlist-card";
    button.dataset.playlistId = playlist.id;
    const image = playlist.image
      ? `<img src="${playlist.image}" alt="">`
      : `<div class="playlist-cover-placeholder"></div>`;
    button.innerHTML = `${image}<span>${playlist.name}</span>`;
    elements.playlistGrid.append(button);
  }
}

async function choosePlaylist(playlistId) {
  if (elements.playlistUrl) elements.playlistUrl.value = `https://open.spotify.com/playlist/${playlistId}`;
  localStorage.setItem("spotify_playlist_url", `https://open.spotify.com/playlist/${playlistId}`);
  await loadPlaylist(playlistId);
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
  const track = pickUnplayedTrack();
  if (!track) {
    setStatus("No hay canciones disponibles");
    return;
  }
  const clipSeconds = DEFAULT_CLIP_SECONDS;
  const positionMs = 0;
  answerVisible = false;
  resetContinueButton();
  const startedAt = Date.now() + PLAYBACK_START_DELAY_MS;
  await api("/api/round", {
    clipSeconds,
    playlistName: state?.playlistName || "",
    incrementRound: true,
    round: {
      track: {
        name: track.name,
        artists: track.artists.map(artist => artist.name).join(", "),
        image: track.album?.images?.[0]?.url || "",
        uri: track.uri
      },
      positionMs,
      startedAt,
      stoppedAt: null,
      revealed: false
    }
  });
  activePlaybackDeviceId = deviceId;
  await playRoundBeep().catch(() => {});
  await wait(PLAYBACK_START_DELAY_MS);
  await spotify(`/me/player/play?device_id=${deviceId}`, {
    method: "PUT",
    body: JSON.stringify({ uris: [track.uri], position_ms: positionMs })
  });
  await api("/api/round", {
    clipSeconds,
    playlistName: state?.playlistName || "",
    clearBuzzes: false,
    round: { ...state.round, startedAt: Date.now(), stoppedAt: null }
  });
  schedulePlaybackPause(clipSeconds);
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
  const clipSeconds = Number(state.clipSeconds || DEFAULT_CLIP_SECONDS);
  answerVisible = false;
  resetContinueButton();
  activePlaybackDeviceId = deviceId;
  const startedAt = Date.now() + PLAYBACK_START_DELAY_MS;
  await api("/api/round", {
    clipSeconds,
    playlistName: state?.playlistName || "",
    clearBuzzes: false,
    round: { ...round, startedAt, stoppedAt: null, revealed: false }
  });
  await playRoundBeep().catch(() => {});
  await wait(PLAYBACK_START_DELAY_MS);
  await spotify(`/me/player/play?device_id=${deviceId}`, {
    method: "PUT",
    body: JSON.stringify({ uris: [round.track.uri], position_ms: round.positionMs || 0 })
  });
  await api("/api/round", {
    clipSeconds,
    playlistName: state?.playlistName || "",
    clearBuzzes: false,
    round: { ...state.round, startedAt: Date.now(), stoppedAt: null }
  });
  schedulePlaybackPause(clipSeconds);
  setStatus("Fragmento repetido");
}

async function revealAnswer() {
  answerVisible = true;
  render();
  if (state?.round) {
    setStatus("Respuesta mostrada");
  } else {
    setStatus("No hay respuesta para mostrar");
  }
}

async function continueSong() {
  if (songContinuing) {
    await spotify("/me/player/pause", { method: "PUT" });
    resetContinueButton();
    setStatus("Cancion pausada");
    return;
  }
  const round = state?.round;
  if (!round?.track?.uri) {
    setStatus("No hay cancion para continuar");
    return;
  }
  if (pausePlaybackTimeoutId) window.clearTimeout(pausePlaybackTimeoutId);
  pausePlaybackTimeoutId = null;
  const deviceId = activePlaybackDeviceId || spotifyDeviceId || await findSpotifyDevice();
  if (!deviceId) {
    setStatus("Abre Spotify en algun dispositivo y presiona continuar otra vez.");
    return;
  }
  const clipMs = Number(state.clipSeconds || DEFAULT_CLIP_SECONDS) * 1000;
  const stoppedAt = round.stoppedAt || Date.now();
  const elapsedMs = Math.min(clipMs, Math.max(0, stoppedAt - round.startedAt));
  const positionMs = Math.max(0, Number(round.positionMs || 0) + elapsedMs);
  activePlaybackDeviceId = deviceId;
  await spotify(`/me/player/play?device_id=${deviceId}`, {
    method: "PUT",
    body: JSON.stringify({ uris: [round.track.uri], position_ms: positionMs })
  });
  songContinuing = true;
  elements.continueSong.textContent = "Pausar";
  elements.continueSong.classList.add("pause-mode");
  elements.continueWarning?.classList.remove("hidden");
  setStatus("Cancion continuando");
}

async function scorePlayer(playerId, delta) {
  if (delta > 0) await stopPlaybackNow();
  await api("/api/score", { playerId, delta });
}

async function activateGoldenGoal() {
  await api("/api/golden-goal");
  closeWinnerModal();
  setStatus("Buzz de Oro activo");
}

function formatBuzzTime(buzz) {
  const startedAt = Number(state?.round?.startedAt || buzz.at);
  const elapsed = Math.max(0, Number(buzz.at || Date.now()) - startedAt);
  return `${(elapsed / 1000).toFixed(1)}s`;
}

function showWinnerModal(winner) {
  if (!winner || !elements.winnerModal) return;
  elements.winnerTitle.textContent = winner.name || "Jugador";
  elements.winnerScore.textContent = `${winner.score || 0} pts`;
  elements.winnerModal.classList.remove("hidden");
}

function closeWinnerModal() {
  elements.winnerModal?.classList.add("hidden");
}

function closeRulesModal() {
  elements.rulesModal?.classList.add("hidden");
  if (connectAfterRules) {
    connectAfterRules = false;
    connectSpotify().catch(error => setStatus(error.message || "No se pudo abrir Spotify"));
  }
}

function showRulesBeforeConnect() {
  connectAfterRules = true;
  elements.rulesModal?.classList.remove("hidden");
}

async function processHostCommand(command) {
  if (!command?.id || command.id === lastHostCommandId) return;
  lastHostCommandId = command.id;
  const action = command.action;
  if (action === "play-round") await playRound();
  if (action === "replay-round") await replayRound();
  if (action === "reveal-answer") await revealAnswer();
  if (action === "continue-song") await continueSong();
  if (action === "golden-goal") await activateGoldenGoal();
  if (action === "clear-buzzes") await api("/api/clear-buzzes");
  if (action === "reset-game") {
    resetPlayedTracks();
    await api("/api/reset");
  }
  if (action === "score") await scorePlayer(command.playerId, command.delta);
}

function updateRoundMeter() {
  const round = state?.round;
  if (!round || round.revealed) {
    elements.roundTimer.textContent = round?.revealed ? "Respuesta" : "--";
    elements.roundProgress.style.width = "0%";
    return;
  }
  const total = Number(state.clipSeconds || DEFAULT_CLIP_SECONDS) * 1000;
  const effectiveNow = round.stoppedAt || Date.now();
  const elapsed = effectiveNow - round.startedAt;
  const remaining = Math.min(total, Math.max(0, total - elapsed));
  const progress = Math.min(100, Math.max(0, (elapsed / total) * 100));
  elements.roundTimer.textContent = `${Math.ceil(remaining / 1000)}s`;
  elements.roundProgress.style.width = `${progress}%`;
}

function render() {
  if (!state) return;
  const round = state.round;
  const showAnswer = answerVisible || round?.revealed;
  const hasCover = Boolean(showAnswer && round?.track?.image);
  const roundNumber = state.roundNumber ? `Ronda ${state.roundNumber}` : "Ronda --";
  const playlistName = showAnswer && round ? state.playlistName || "Playlist" : "Playlist";
  elements.playlistBanner.textContent = state.playlistName ? `Playlist: ${state.playlistName}` : "Playlist sin cargar";
  elements.answerPanel?.classList.toggle("answer-hidden", !showAnswer);
  elements.cover.classList.toggle("cover-placeholder", !hasCover);
  elements.cover.src = hasCover ? round.track.image : "";
  elements.roundLabel.textContent = `${roundNumber} \u00b7 ${playlistName}`;
  elements.trackTitle.textContent = showAnswer && round ? round.track.name : "Cancion";
  elements.trackArtist.textContent = showAnswer && round ? round.track.artists : "Artista";
  updateRoundMeter();

  elements.buzzList.innerHTML = "";
  state.buzzes.forEach((buzz, index) => {
    const li = document.createElement("li");
    li.className = "buzz-item";
    li.innerHTML = `<strong><span>${index + 1}.</span> ${buzz.name}</strong><span class="buzz-time">${formatBuzzTime(buzz)}</span><button class="score-action positive" data-score="1" data-player="${buzz.playerId}">+1</button><button class="score-action negative" data-score="-1" data-player="${buzz.playerId}">-1</button>`;
    elements.buzzList.append(li);
  });
  if (!state.buzzes.length) {
    const li = document.createElement("li");
    li.textContent = "Esperando buzzers.";
    elements.buzzList.append(li);
  }

  elements.scoreboard.innerHTML = "";
  if (state.goldenGoal) {
    const banner = document.createElement("p");
    banner.className = "golden-goal-banner";
    banner.textContent = "Buzz de Oro activo";
    elements.scoreboard.append(banner);
  }
  for (const player of state.players) {
    const row = document.createElement("div");
    const isWinner = state.winner?.id === player.id;
    row.className = "score-row";
    row.classList.toggle("winner", isWinner);
    const suffix = isWinner ? " - Ganador" : "";
    row.innerHTML = `<strong>${player.name}${isWinner ? " · Ganador" : ""}</strong><span class="score">${player.score}</span><span>/${state.pointTarget || 10}</span>`;
    row.innerHTML = `<strong>${player.name}${suffix}</strong><span class="score">${player.score}</span><span>/${state.pointTarget || 10}</span>`;
    elements.scoreboard.append(row);
  }
  if (!state.players.length) {
    elements.scoreboard.innerHTML = `<p class="muted">Esperando jugadores...</p>`;
  }
  if (state.winner?.id && state.winner.id !== lastWinnerId) {
    lastWinnerId = state.winner.id;
    showWinnerModal(state.winner);
  } else if (!state.winner) {
    lastWinnerId = "";
  }
}

function connectEvents() {
  eventSource?.close();
  eventSource = new EventSource(`/events?room=${encodeURIComponent(room())}`);
  eventSource.onmessage = event => {
    const nextState = JSON.parse(event.data);
    pauseOnNewBuzz(state, nextState);
    state = nextState;
    render();
    processHostCommand(nextState.hostCommand).catch(error => setStatus(error.message || "No se pudo ejecutar control host"));
  };
}

elements.connectSpotify.addEventListener("click", showRulesBeforeConnect);
elements.activateScreenPlayer?.addEventListener("click", () => activateScreenPlayer().catch(error => setStatus(error.message || "No se pudo activar esta pantalla")));
elements.disconnectSpotify.addEventListener("click", () => disconnectSpotify().catch(error => setStatus(error.message || "No se pudo desconectar Spotify")));
elements.loadPlaylist?.addEventListener("click", () => loadPlaylist().catch(error => setStatus(error.message)));
elements.refreshPlaylists.addEventListener("click", () => loadUserPlaylists().catch(error => setStatus(error.message)));
elements.playRound.addEventListener("click", () => playRound().catch(error => setStatus(error.message)));
elements.replayRound.addEventListener("click", () => replayRound().catch(error => setStatus(error.message)));
elements.revealAnswer.addEventListener("click", () => revealAnswer().catch(error => setStatus(error.message)));
elements.continueSong.addEventListener("click", () => continueSong().catch(error => setStatus(error.message)));
elements.goldenGoal.addEventListener("click", () => activateGoldenGoal().catch(error => setStatus(error.message)));
elements.clearBuzzes.addEventListener("click", () => api("/api/clear-buzzes"));
elements.closeWinnerModal.addEventListener("click", closeWinnerModal);
elements.closeRulesModal?.addEventListener("click", closeRulesModal);
elements.resetGame.addEventListener("click", () => {
  if (!confirm("Reiniciar jugadores y puntajes?")) return;
  resetPlayedTracks();
  api("/api/reset");
});
elements.copyJoinUrl?.addEventListener("click", () => copyJoinUrl().catch(() => setStatus("No se pudo copiar el enlace")));
elements.roomId?.addEventListener("change", () => {
  localStorage.setItem("room_id", room());
  updateJoinUrl();
  connectEvents();
});
elements.buzzList.addEventListener("click", event => {
  const button = event.target.closest("button[data-player]");
  if (!button) return;
  scorePlayer(button.dataset.player, Number(button.dataset.score)).catch(error => setStatus(error.message));
});
elements.playlistGrid.addEventListener("click", event => {
  const button = event.target.closest("button[data-playlist-id]");
  if (!button) return;
  choosePlaylist(button.dataset.playlistId).catch(error => setStatus(error.message));
});

if (elements.clientId) {
  elements.clientId.value = localStorage.getItem("spotify_client_id") || DEFAULT_SPOTIFY_CLIENT_ID;
  localStorage.setItem("spotify_client_id", elements.clientId.value);
}
if (elements.playlistUrl) elements.playlistUrl.value = localStorage.getItem("spotify_playlist_url") || "";
if (elements.roomId) {
  elements.roomId.value = localStorage.getItem("room_id") || new URLSearchParams(location.search).get("room") || "default";
}
forgetSpotifySessionOnFreshLoad()
  .then(() => finishAuth())
  .then(async authResult => {
    const params = new URLSearchParams(location.search);
    const serverSession = authResult === "connected" ? await refreshSpotifyToken() : false;
    if (!serverSession && validToken()) setStatus("Spotify conectado");
    if (validToken()) {
      sessionStorage.removeItem("spotify_auto_connect_attempted");
      loadUserPlaylists().catch(error => setStatus(error.message));
      activateScreenPlayer().catch(() => setStatus("Spotify conectado. Reactiva el reproductor si no suena en pantalla"));
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
