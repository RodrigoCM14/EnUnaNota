import { initLanguageControls, t, translatePage, translateServerMessage } from "./i18n.js";

const $ = selector => document.querySelector(selector);

const DEFAULT_SPOTIFY_CLIENT_ID = "8791a946e68c476cac41c3d5023a86a7";
const DEFAULT_CLIP_SECONDS = 10;
const WELCOME_SEEN_KEY = "en_una_nota_welcome_seen";

const elements = {
  welcomeScreen: $("#welcomeScreen"),
  welcomeStatus: $("#welcomeStatus"),
  clientId: $("#clientId"),
  playlistUrl: $("#playlistUrl"),
  roomId: $("#roomId"),
  connectSpotify: $("#connectSpotify"),
  closeWelcome: $("#closeWelcome"),
  changeLanguage: $("#changeLanguage"),
  activateScreenPlayer: $("#activateScreenPlayer"),
  disconnectSpotify: $("#disconnectSpotify"),
  loadPlaylist: $("#loadPlaylist"),
  refreshPlaylists: $("#refreshPlaylists"),
  playlistGrid: $("#playlistGrid"),
  playRound: $("#playRound"),
  replayRound: $("#replayRound"),
  revealAnswer: $("#revealAnswer"),
  continueSong: $("#continueSong"),
  playFullSong: $("#playFullSong"),
  manualTimer: $("#manualTimer"),
  goldenGoal: $("#goldenGoal"),
  clearBuzzes: $("#clearBuzzes"),
  resetGame: $("#resetGame"),
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
  roundMeter: $(".round-meter"),
  roundTimer: $("#roundTimer"),
  roundProgress: $("#roundProgress"),
  manualTimerOverlay: $("#manualTimerOverlay"),
  goldenVotePanel: $("#goldenVotePanel"),
  goldenVoteStatus: $("#goldenVoteStatus"),
  buzzList: $("#buzzList"),
  scoreboard: $("#scoreboard"),
  winnerModal: $("#winnerModal"),
  winnerTitle: $("#winnerTitle"),
  winnerScore: $("#winnerScore"),
  continueMatch: $("#continueMatch"),
  chooseAnotherPlaylist: $("#chooseAnotherPlaylist"),
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
let activePlaybackDeviceId = "";
let playlistTracks = [];
let playedTrackUris = new Set(JSON.parse(localStorage.getItem("played_track_uris") || "[]"));
let answerVisible = false;
let eventSource = null;
let state = null;
let lastWinnerId = "";
let songPlaybackMode = "";
let phoneBaseUrl = "";
let pausePlaybackTimeoutId = null;
let lastHostCommandId = "";
let connectAfterRules = false;
let continuationEndsAt = 0;
let finalSongWinnerId = "";
let manualTimerIntervalId = null;
let manualTimerTimeoutId = null;
let lastStatus = { message: "common.spotifyDisconnected", values: {} };
const PLAYBACK_START_DELAY_MS = 1000;
const CONTINUE_TOTAL_MS = 30_000;

function canonicalHostUrl() {
  const url = new URL(location.href);
  if (url.hostname === "localhost" || url.hostname === "::1" || url.hostname === "[::1]") {
    url.hostname = "127.0.0.1";
  }
  if (url.hostname.endsWith(".onrender.com")) url.protocol = "https:";
  return url;
}

function redirectLocalhostToLoopback() {
  if (location.hostname !== "localhost" && location.hostname !== "::1" && location.hostname !== "[::1]") return false;
  location.replace(canonicalHostUrl().href);
  return true;
}

if (redirectLocalhostToLoopback()) await new Promise(() => {});

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

function localized(message, values = {}) {
  return /^[a-z0-9_.-]+$/i.test(String(message)) ? t(message, values) : translateServerMessage(String(message));
}

function setStatus(message, values = {}) {
  lastStatus = { message, values };
  const text = localized(message, values);
  const disconnected = /sin conectar|not connected|desconectado|disconnected|error|no se pudo|could not|conecta spotify|connect spotify|premium requerido|premium required|pendiente/i.test(text);
  const connected = !disconnected && /conectado|connected|listo|ready|activa|active|cargad|loaded|repetido|replayed|mostrada|revealed|continuando|continuing|buzz de oro|golden buzz/i.test(text);
  elements.spotifyStatus.textContent = connected ? "\u2713" : "\u2715";
  elements.spotifyStatus.title = text;
  elements.spotifyStatus.setAttribute("aria-label", text);
  elements.spotifyStatus.classList.toggle("connected", connected);
  elements.spotifyStatus.classList.toggle("disconnected", !connected);
  elements.spotifyStatusText.textContent = text;
  if (elements.welcomeStatus) elements.welcomeStatus.textContent = text;
}

function hasSeenWelcome() {
  return localStorage.getItem(WELCOME_SEEN_KEY) === "1";
}

function rememberWelcomeSeen() {
  localStorage.setItem(WELCOME_SEEN_KEY, "1");
}

function showWelcome() {
  elements.welcomeScreen?.classList.remove("hidden");
  document.body.classList.add("welcome-active");
}

function hideWelcome({ remember = false } = {}) {
  if (remember) rememberWelcomeSeen();
  elements.welcomeScreen?.classList.add("hidden");
  document.body.classList.remove("welcome-active");
}

function syncWelcomeForSession() {
  if (hasSeenWelcome()) {
    hideWelcome();
  } else {
    showWelcome();
  }
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
  rememberWelcomeSeen();
  if (location.hostname.endsWith(".onrender.com") && location.protocol !== "https:") {
    const url = canonicalHostUrl();
    location.replace(url.href);
    return;
  }
  if (location.hostname === "localhost" || location.hostname === "::1" || location.hostname === "[::1]") {
    const url = canonicalHostUrl();
    url.searchParams.set("connect", "spotify");
    location.replace(url.href);
    return;
  }
  const clientId = spotifyClientId();
  if (!clientId) {
    setStatus("host.status.addClientId");
    return;
  }
  localStorage.setItem("spotify_client_id", clientId);
  const url = new URL("/api/spotify-login", location.origin);
  url.searchParams.set("client_id", clientId);
  setStatus("host.status.openingSpotify");
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
  hideWelcome({ remember: true });
  setStatus("host.status.spotifyDisconnected");
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
  const token = await response.json().catch(() => ({ error: t("host.status.invalidServerResponse") }));
  return { response, token };
}

async function finishAuth() {
  const params = new URLSearchParams(location.search);
  const spotifyResult = params.get("spotify");
  if (spotifyResult === "connected") {
    history.replaceState({}, "", location.pathname);
    setStatus("host.status.connectedLoadPlaylist");
    return "connected";
  }
  if (spotifyResult === "error") {
    const message = params.get("message") || t("host.status.cannotConnectSpotify");
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
    setStatus("host.status.stateMismatch");
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
    const detail = token.error_description || token.error || t("host.status.cannotConnectSpotify");
    setStatus(`Spotify token ${response.status}: ${detail}`);
    return "error";
  }
  saveToken(token);
  localStorage.removeItem("spotify_code_verifier");
  localStorage.removeItem("spotify_auth_state");
  setStatus("host.status.connected");
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
  setStatus(session.scope ? `${t("host.status.connected")} (${session.scope})` : "host.status.connected");
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
    setStatus("host.status.allPlayedReset");
  }
  const track = availableTracks[Math.floor(Math.random() * availableTracks.length)];
  if (track?.uri) {
    playedTrackUris.add(track.uri);
    savePlayedTracks();
  }
  return track || null;
}

function resetContinueButton() {
  songPlaybackMode = "";
  continuationEndsAt = 0;
  elements.continueSong.textContent = t("host.continue");
  elements.continueSong.classList.remove("pause-mode");
  elements.playFullSong.textContent = t("host.fullSong");
  elements.playFullSong.classList.remove("pause-mode");
  elements.continueWarning?.classList.add("hidden");
}

async function pausePlaybackForBuzz() {
  if (pausePlaybackTimeoutId) window.clearTimeout(pausePlaybackTimeoutId);
  pausePlaybackTimeoutId = null;
  resetContinueButton();
  await spotify("/me/player/pause", { method: "PUT" });
  await markRoundStopped();
  setStatus("host.status.buzzPaused");
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
  if (!validToken()) throw new Error(t("host.status.reconnectSpotify"));
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
    if (window.Spotify || window.spotifyWebPlaybackSdkReady) return resolve();
    const previousReady = window.onSpotifyWebPlaybackSDKReady;
    window.onSpotifyWebPlaybackSDKReady = () => {
      window.spotifyWebPlaybackSdkReady = true;
      previousReady?.();
      resolve();
    };
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
        reject(new Error(t("host.status.screenDeviceMissing")));
      }
    }, 150);
  });
}

async function initPlayer(activate = false) {
  if (spotifyPlayer || !validToken()) return;
  setStatus("host.status.startingPlayer");
  await Promise.race([
    waitForSpotifySdk(),
    new Promise((_, reject) => window.setTimeout(() => reject(new Error(t("host.status.sdkFailed"))), 8000))
  ]);
  spotifyPlayer = new Spotify.Player({
    name: "En Una Nota",
    getOAuthToken: cb => cb(accessToken),
    volume: 0.8
  });
  spotifyPlayer.addListener("ready", ({ device_id }) => {
    spotifyDeviceId = device_id;
    setStatus("host.status.readyToPlay");
  });
  spotifyPlayer.addListener("not_ready", () => setStatus("host.status.spotifyDisconnected"));
  spotifyPlayer.addListener("account_error", () => setStatus("host.status.premiumRequired"));
  spotifyPlayer.addListener("playback_error", error => setStatus(error.message || t("host.status.playbackError")));
  if (activate) spotifyPlayer.activateElement?.();
  const connected = await spotifyPlayer.connect();
  if (!connected) throw new Error(t("host.status.playerFailed"));
  await waitForScreenDevice();
}

async function activateScreenPlayer() {
  if (!validToken()) await refreshSpotifyToken();
  if (!validToken()) {
    setStatus("host.status.connectFirst");
    return;
  }
  await initPlayer(true);
  if (!spotifyPlayer || !spotifyDeviceId) {
    setStatus("host.status.screenNotReady");
    return;
  }
  spotifyPlayer.activateElement?.();
  await spotify("/me/player", {
    method: "PUT",
    body: JSON.stringify({ device_ids: [spotifyDeviceId], play: false })
  });
  activePlaybackDeviceId = spotifyDeviceId;
  setStatus("host.status.screenActive");
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
    activePlaybackDeviceId = usable.id;
    setStatus(`Spotify listo en ${usable.name}`);
    return activePlaybackDeviceId;
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
    setStatus("host.status.chooseValidPlaylist");
    return;
  }
  localStorage.setItem("spotify_playlist_url", `https://open.spotify.com/playlist/${id}`);
  const response = await fetch(`/api/spotify-playlist?id=${encodeURIComponent(id)}`);
  const playlist = await response.json().catch(() => ({ error: t("host.status.invalidServerResponse") }));
  if (!response.ok) {
    const endpoint = playlist.endpoint ? ` (${playlist.endpoint})` : "";
    const attempts = playlist.attempts ? ` Intentos: ${playlist.attempts}.` : "";
    const owner = playlist.owner?.id ? ` ${t("host.status.owner")}: ${playlist.owner.id}. ${t("host.status.yourUser")}: ${playlist.currentUserId || t("host.status.unknown")}.` : "";
    throw new Error(`Spotify playlist ${response.status}: ${playlist.error || t("host.status.playlistForbidden")}.${attempts}${owner}${endpoint}`);
  }
  playlistTracks = playlist.tracks || [];
  resetPlayedTracks();
  await api("/api/reset-match", { playlistName: playlist.name || "Playlist" });
  if (!playlistTracks.length && playlist.summary) {
    setStatus("host.status.zeroSongs", {
      items: playlist.summary.items,
      tracks: playlist.summary.playableTracks,
      nonTracks: playlist.summary.nonTracks
    });
    return;
  }
  setStatus("host.status.loadedSongs", { count: playlistTracks.length });
}

async function loadUserPlaylists() {
  elements.playlistGrid.innerHTML = `<p class="muted">${t("host.status.loadingPlaylists")}</p>`;
  const response = await fetch("/api/spotify-playlists");
  const data = await response.json().catch(() => ({ error: t("host.status.invalidServerResponse") }));
  if (!response.ok) {
    throw new Error(`Spotify playlists ${response.status}: ${data.error || t("host.status.playlistsFailed")}`);
  }
  renderPlaylistPicker(data.playlists || []);
}

function renderPlaylistPicker(playlists) {
  elements.playlistGrid.innerHTML = "";
  if (!playlists.length) {
    elements.playlistGrid.innerHTML = `<p class="muted">${t("host.status.noPlaylists")}</p>`;
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
  if (state?.goldenVote?.active) {
    setStatus("host.status.waitGoldenVote");
    return;
  }
  if (state?.gameOver) {
    setStatus("host.status.gameOver");
    return;
  }
  await initPlayer().catch(error => setStatus(error.message));
  const deviceId = spotifyDeviceId || await findSpotifyDevice();
  if (!deviceId) {
    setStatus("host.status.openDevicePlay");
    return;
  }
  if (!playlistTracks.length) {
    setStatus("host.status.loadPlaylistFirst");
    return;
  }
  const track = pickUnplayedTrack();
  if (!track) {
    setStatus("host.status.noSongs");
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
      revealed: false,
      acceptBuzzes: false,
      eliminatedPlayerIds: []
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
    round: { ...state.round, startedAt: Date.now(), stoppedAt: null, acceptBuzzes: true }
  });
  schedulePlaybackPause(clipSeconds);
}

async function replayRound() {
  if (state?.goldenVote?.active) {
    setStatus("host.status.waitGoldenVote");
    return;
  }
  const round = state?.round;
  if (!round?.track?.uri) {
    setStatus("host.status.noFragment");
    return;
  }
  const deviceId = activePlaybackDeviceId || spotifyDeviceId || await findSpotifyDevice();
  if (!deviceId) {
    setStatus("host.status.openDevicePlay");
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
    round: { ...round, startedAt, stoppedAt: null, revealed: false, acceptBuzzes: false }
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
    round: { ...state.round, startedAt: Date.now(), stoppedAt: null, acceptBuzzes: true }
  });
  schedulePlaybackPause(clipSeconds);
  setStatus("host.status.fragmentRepeated");
}

async function revealAnswer() {
  answerVisible = true;
  if (state?.round) {
    await stopPlaybackNow();
    await api("/api/round", {
      round: { ...state.round, stoppedAt: state.round.stoppedAt || Date.now(), acceptBuzzes: false },
      clipSeconds: Number(state.clipSeconds || DEFAULT_CLIP_SECONDS),
      playlistName: state.playlistName || "",
      clearBuzzes: false
    });
    setStatus("host.status.answerShown");
  } else {
    render();
    setStatus("host.status.noAnswer");
  }
}

async function pauseExtendedPlayback() {
  if (pausePlaybackTimeoutId) window.clearTimeout(pausePlaybackTimeoutId);
  pausePlaybackTimeoutId = null;
  await spotify("/me/player/pause", { method: "PUT" });
  resetContinueButton();
  setStatus("host.status.songPaused");
}

function continuationPositionMs(round) {
  const clipMs = Number(state.clipSeconds || DEFAULT_CLIP_SECONDS) * 1000;
  const stoppedAt = round.stoppedAt || Date.now();
  const elapsedMs = Math.min(clipMs, Math.max(0, stoppedAt - round.startedAt));
  return Math.max(0, Number(round.positionMs || 0) + elapsedMs);
}

async function playSongFromCurrentRound(mode) {
  const round = state?.round;
  if (!round?.track?.uri) {
    setStatus("host.status.noSongContinue");
    return;
  }
  if (pausePlaybackTimeoutId) window.clearTimeout(pausePlaybackTimeoutId);
  pausePlaybackTimeoutId = null;
  const deviceId = activePlaybackDeviceId || spotifyDeviceId || await findSpotifyDevice();
  if (!deviceId) {
    setStatus("host.status.openDeviceContinue");
    return;
  }
  const positionMs = continuationPositionMs(round);
  activePlaybackDeviceId = deviceId;
  await spotify(`/me/player/play?device_id=${deviceId}`, {
    method: "PUT",
    body: JSON.stringify({ uris: [round.track.uri], position_ms: positionMs })
  });
  songPlaybackMode = mode;
  if (mode === "continue") {
    const remainingMs = Math.max(0, CONTINUE_TOTAL_MS - positionMs);
    if (remainingMs <= 0) {
      await pauseExtendedPlayback();
      setStatus("host.status.alreadyPlayed30");
      return;
    }
    continuationEndsAt = Date.now() + remainingMs;
    scheduleLimitedContinuationPause(remainingMs);
    elements.continueSong.textContent = t("host.pause");
    elements.continueSong.classList.add("pause-mode");
    elements.continueWarning?.classList.remove("hidden");
    setStatus("host.status.continuing30");
  } else {
    continuationEndsAt = 0;
    elements.playFullSong.textContent = t("host.pause");
    elements.playFullSong.classList.add("pause-mode");
    elements.continueWarning?.classList.add("hidden");
    setStatus("host.status.fullPlaying");
  }
}

function scheduleLimitedContinuationPause(ms) {
  if (pausePlaybackTimeoutId) window.clearTimeout(pausePlaybackTimeoutId);
  pausePlaybackTimeoutId = window.setTimeout(async () => {
    pausePlaybackTimeoutId = null;
    await spotify("/me/player/pause", { method: "PUT" }).catch(() => {});
    await markRoundStopped().catch(() => {});
    resetContinueButton();
    setStatus("host.status.continuationPaused30");
  }, ms);
}

async function continueSong() {
  if (songPlaybackMode === "continue") {
    await pauseExtendedPlayback();
    return;
  }
  if (songPlaybackMode === "full") {
    await pauseExtendedPlayback();
    return;
  }
  await playSongFromCurrentRound("continue");
}

async function playFullSong() {
  if (songPlaybackMode === "full") {
    await pauseExtendedPlayback();
    return;
  }
  if (songPlaybackMode === "continue") {
    await pauseExtendedPlayback();
    return;
  }
  await playSongFromCurrentRound("full");
}

async function scorePlayer(playerId, delta) {
  if (delta > 0) await stopPlaybackNow();
  await api("/api/score", { playerId, delta });
}

async function activateGoldenGoal() {
  await api("/api/golden-goal");
  closeWinnerModal();
  setStatus("host.status.voteStarted");
}

async function continueMatch() {
  await api("/api/continue-match", { playlistName: state?.playlistName || "" });
  answerVisible = false;
  finalSongWinnerId = "";
  closeWinnerModal();
  resetContinueButton();
  setStatus("host.status.matchReady");
}

function chooseAnotherPlaylist() {
  closeWinnerModal();
  document.querySelector(".setup-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  elements.refreshPlaylists?.focus();
  setStatus("host.status.choosePlaylistRestart");
}

function stopManualTimer() {
  if (manualTimerIntervalId) window.clearInterval(manualTimerIntervalId);
  if (manualTimerTimeoutId) window.clearTimeout(manualTimerTimeoutId);
  manualTimerIntervalId = null;
  manualTimerTimeoutId = null;
  elements.manualTimerOverlay?.classList.add("hidden");
}

function startManualTimer(seconds = 10) {
  stopManualTimer();
  let remaining = seconds;
  elements.manualTimerOverlay.textContent = String(remaining);
  elements.manualTimerOverlay.classList.remove("hidden");
  manualTimerIntervalId = window.setInterval(() => {
    remaining -= 1;
    elements.manualTimerOverlay.textContent = String(Math.max(0, remaining));
    if (remaining <= 0) stopManualTimer();
  }, 1000);
  manualTimerTimeoutId = window.setTimeout(stopManualTimer, (seconds + 1) * 1000);
}

function formatBuzzTime(buzz) {
  if (Number.isFinite(Number(buzz.elapsedMs))) return `${(Number(buzz.elapsedMs) / 1000).toFixed(1)}s`;
  const startedAt = Number(state?.round?.startedAt || buzz.at);
  const elapsed = Math.max(0, Number(buzz.at || Date.now()) - startedAt);
  return `${(elapsed / 1000).toFixed(1)}s`;
}

function showWinnerModal(winner) {
  if (!winner || !elements.winnerModal) return;
  elements.winnerTitle.textContent = winner.name || t("common.player");
  elements.winnerScore.textContent = `${winner.score || 0} ${t("common.points")}`;
  renderConfetti();
  elements.winnerModal.classList.remove("hidden");
}

function closeWinnerModal() {
  elements.winnerModal?.classList.add("hidden");
}

function renderConfetti() {
  const old = elements.winnerModal?.querySelector(".confetti");
  old?.remove();
  const confetti = document.createElement("div");
  confetti.className = "confetti";
  for (let index = 0; index < 42; index += 1) {
    const piece = document.createElement("span");
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.animationDelay = `${Math.random() * 0.9}s`;
    piece.style.setProperty("--drift", `${Math.random() * 80 - 40}px`);
    piece.style.setProperty("--spin", `${Math.random() * 540 + 180}deg`);
    confetti.append(piece);
  }
  elements.winnerModal?.append(confetti);
}

function closeRulesModal() {
  elements.rulesModal?.classList.add("hidden");
  if (connectAfterRules) {
    connectAfterRules = false;
    connectSpotify().catch(error => setStatus(error.message || t("host.status.cannotOpenSpotify")));
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
  if (action === "play-full-song") await playFullSong();
  if (action === "timer-10") startManualTimer(10);
  if (action === "golden-goal") await activateGoldenGoal();
  if (action === "clear-buzzes") await api("/api/clear-buzzes");
  if (action === "continue-match") await continueMatch();
  if (action === "choose-playlist") chooseAnotherPlaylist();
  if (action === "reset-game") {
    resetPlayedTracks();
    await api("/api/reset");
  }
  if (action === "score") await scorePlayer(command.playerId, command.delta);
}

function renderLocalizedGoldenVote() {
  const vote = state?.goldenVote;
  if (!elements.goldenVotePanel || !elements.goldenVoteStatus) return;
  const showVote = Boolean(vote) || state?.goldenGoal;
  elements.goldenVotePanel.classList.toggle("hidden", !showVote);
  elements.goldenVotePanel.classList.toggle("approved", Boolean(state?.goldenGoal || vote?.approved));
  elements.goldenVotePanel.classList.toggle("rejected", Boolean(vote?.rejected));
  if (!showVote) return;
  if (state.goldenGoal) {
    elements.goldenVotePanel.querySelector("strong").textContent = t("host.status.goldenActive");
    elements.goldenVoteStatus.textContent = t("host.status.nextCorrectWins");
    return;
  }
  if (vote.rejected) {
    elements.goldenVotePanel.querySelector("strong").textContent = t("host.status.goldenRejected");
    elements.goldenVoteStatus.textContent = `${vote.yes || 0} ${t("common.yes")} / ${vote.no || 0} ${t("common.no")}`;
    return;
  }
  elements.goldenVotePanel.querySelector("strong").textContent = t("host.goldenVoteProposed");
  elements.goldenVoteStatus.textContent = `${vote.yes || 0} ${t("common.yes")} / ${vote.no || 0} ${t("common.no")} - ${t("common.requires")} ${vote.required || 0} ${t("common.of")} ${vote.total || 0}`;
}

function playFinalSongIfNeeded() {
  const winner = state?.winner;
  if (!winner?.id || finalSongWinnerId === winner.id) return;
  finalSongWinnerId = winner.id;
  if (state?.round?.track?.uri) {
    playSongFromCurrentRound("full").catch(error => setStatus(error.message || t("host.status.finalSongFailed")));
  }
}

function updateRoundMeter() {
  const round = state?.round;
  elements.roundMeter?.classList.toggle("hidden", songPlaybackMode === "full");
  if (songPlaybackMode === "full") {
    elements.roundTimer.textContent = "";
    elements.roundProgress.style.width = "0%";
    return;
  }
  if (songPlaybackMode === "continue" && continuationEndsAt) {
    const remaining = Math.max(0, continuationEndsAt - Date.now());
    const elapsed = CONTINUE_TOTAL_MS - remaining;
    const progress = Math.min(100, Math.max(0, (elapsed / CONTINUE_TOTAL_MS) * 100));
    elements.roundTimer.textContent = `${Math.ceil(remaining / 1000)}s`;
    elements.roundProgress.style.width = `${progress}%`;
    return;
  }
  if (!round || round.revealed) {
    elements.roundTimer.textContent = round?.revealed ? t("host.status.answer") : "--";
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
  const roundNumber = state.roundNumber ? `${t("host.status.round")} ${state.roundNumber}` : t("host.status.roundEmpty");
  const playlistName = showAnswer && round ? state.playlistName || t("common.playlist") : t("common.playlist");
  elements.playlistBanner.textContent = state.playlistName ? `${t("common.playlist")}: ${state.playlistName}` : t("common.playlistUnloaded");
  elements.answerPanel?.classList.toggle("answer-hidden", !showAnswer);
  elements.cover.classList.toggle("cover-placeholder", !hasCover);
  elements.cover.src = hasCover ? round.track.image : "";
  elements.roundLabel.textContent = `${roundNumber} \u00b7 ${playlistName}`;
  elements.trackTitle.textContent = showAnswer && round ? round.track.name : t("common.song");
  elements.trackArtist.textContent = showAnswer && round ? round.track.artists : t("common.artist");
  updateRoundMeter();
  renderLocalizedGoldenVote();

  elements.buzzList.innerHTML = "";
  state.buzzes.forEach((buzz, index) => {
    const li = document.createElement("li");
    li.className = "buzz-item";
    li.innerHTML = `<strong><span>${index + 1}.</span> ${buzz.name}</strong><span class="buzz-time">${formatBuzzTime(buzz)}</span><button class="score-action positive" data-score="1" data-player="${buzz.playerId}">+1</button><button class="score-action negative" data-score="-1" data-player="${buzz.playerId}">-1</button>`;
    elements.buzzList.append(li);
  });
  if (!state.buzzes.length) {
    const li = document.createElement("li");
    li.textContent = t("host.status.waitingBuzzers");
    elements.buzzList.append(li);
  }

  elements.scoreboard.innerHTML = "";
  if (state.goldenGoal) {
    const banner = document.createElement("p");
    banner.className = "golden-goal-banner";
    banner.textContent = t("host.status.goldenActive");
    elements.scoreboard.append(banner);
  }
  for (const player of state.players) {
    const row = document.createElement("div");
    const isWinner = state.winner?.id === player.id;
    row.className = "score-row";
    row.classList.toggle("winner", isWinner);
    const suffix = isWinner ? t("host.status.winnerSuffix") : "";
    row.innerHTML = `<strong>${player.name}${isWinner ? " · Ganador" : ""}</strong><span class="score">${player.score}</span><span>/${state.pointTarget || 10}</span>`;
    row.innerHTML = `<strong>${player.name}${suffix}</strong><span class="score">${player.score}</span><span>/${state.pointTarget || 10}</span>`;
    elements.scoreboard.append(row);
  }
  if (!state.players.length) {
    elements.scoreboard.innerHTML = `<p class="muted">${t("host.status.waitingPlayers")}</p>`;
  }
  if (state.winner?.id && state.winner.id !== lastWinnerId) {
    lastWinnerId = state.winner.id;
    showWinnerModal(state.winner);
    playFinalSongIfNeeded();
  } else if (!state.winner) {
    lastWinnerId = "";
    finalSongWinnerId = "";
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
    processHostCommand(nextState.hostCommand).catch(error => setStatus(error.message || t("host.status.hostCommandFailed")));
  };
}

function refreshLanguage() {
  translatePage();
  if (songPlaybackMode === "continue") {
    elements.continueSong.textContent = t("host.pause");
    elements.playFullSong.textContent = t("host.fullSong");
  } else if (songPlaybackMode === "full") {
    elements.continueSong.textContent = t("host.continue");
    elements.playFullSong.textContent = t("host.pause");
  } else {
    elements.continueSong.textContent = t("host.continue");
    elements.playFullSong.textContent = t("host.fullSong");
  }
  if (state) render();
  if (lastStatus) setStatus(lastStatus.message, lastStatus.values);
}

initLanguageControls(refreshLanguage);
refreshLanguage();
syncWelcomeForSession();

elements.connectSpotify?.addEventListener("click", showRulesBeforeConnect);
elements.closeWelcome?.addEventListener("click", () => hideWelcome({ remember: true }));
elements.changeLanguage?.addEventListener("click", showWelcome);
elements.activateScreenPlayer?.addEventListener("click", () => activateScreenPlayer().catch(error => setStatus(error.message || t("host.status.activateScreenFailed"))));
elements.disconnectSpotify?.addEventListener("click", () => disconnectSpotify().catch(error => setStatus(error.message || t("host.status.disconnectFailed"))));
elements.loadPlaylist?.addEventListener("click", () => loadPlaylist().catch(error => setStatus(error.message)));
elements.refreshPlaylists.addEventListener("click", () => loadUserPlaylists().catch(error => setStatus(error.message)));
elements.playRound.addEventListener("click", () => playRound().catch(error => setStatus(error.message)));
elements.replayRound.addEventListener("click", () => replayRound().catch(error => setStatus(error.message)));
elements.revealAnswer.addEventListener("click", () => revealAnswer().catch(error => setStatus(error.message)));
elements.continueSong.addEventListener("click", () => continueSong().catch(error => setStatus(error.message)));
elements.playFullSong.addEventListener("click", () => playFullSong().catch(error => setStatus(error.message)));
elements.manualTimer?.addEventListener("click", () => startManualTimer(10));
elements.goldenGoal.addEventListener("click", () => activateGoldenGoal().catch(error => setStatus(error.message)));
elements.clearBuzzes.addEventListener("click", () => api("/api/clear-buzzes"));
elements.continueMatch?.addEventListener("click", () => continueMatch().catch(error => setStatus(error.message)));
elements.chooseAnotherPlaylist?.addEventListener("click", chooseAnotherPlaylist);
elements.closeWinnerModal.addEventListener("click", closeWinnerModal);
elements.closeRulesModal?.addEventListener("click", closeRulesModal);
elements.resetGame.addEventListener("click", () => {
  if (!confirm(t("host.status.restartConfirm"))) return;
  resetPlayedTracks();
  api("/api/reset");
});
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
finishAuth()
  .then(async authResult => {
    const params = new URLSearchParams(location.search);
    if (authResult === "connected") hideWelcome({ remember: true });
    const serverSession = await refreshSpotifyToken();
    if (!serverSession && validToken()) setStatus("host.status.connected");
    if (validToken()) {
      hideWelcome({ remember: true });
      sessionStorage.removeItem("spotify_auto_connect_attempted");
      loadUserPlaylists().catch(error => setStatus(error.message));
      activateScreenPlayer().catch(() => setStatus("host.status.reactivatePlayer"));
    } else if (params.get("connect") === "spotify" && !params.has("code") && !params.has("error") && !sessionStorage.getItem("spotify_auto_connect_attempted")) {
      sessionStorage.setItem("spotify_auto_connect_attempted", "1");
      history.replaceState({}, "", location.pathname);
      await connectSpotify();
    } else {
      syncWelcomeForSession();
    }
  })
  .catch(error => {
    syncWelcomeForSession();
    setStatus(error.message);
  });
updateJoinUrl();
loadServerInfo().catch(() => {});
connectEvents();
window.setInterval(updateRoundMeter, 250);
