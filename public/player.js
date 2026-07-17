import { initLanguageControls, t, translatePage, translateServerMessage } from "./i18n.js";

const $ = selector => document.querySelector(selector);

const joinScreen = $("#joinScreen");
const buzzerScreen = $("#buzzerScreen");
const playerName = $("#playerName");
const adminKey = $("#adminKey");
const joinError = $("#joinError");
const joinGame = $("#joinGame");
const buzzButton = $("#buzzButton");
const hello = $("#hello");
const playerScore = $("#playerScore");
const rank = $("#rank");
const roundState = $("#roundState");
const buzzState = $("#buzzState");
const goldenVoteBox = $("#goldenVoteBox");
const goldenVoteText = $("#goldenVoteText");
const acceptGoldenVote = $("#acceptGoldenVote");
const rejectGoldenVote = $("#rejectGoldenVote");
const adminControls = $("#adminControls");
const adminPlaylistSelect = $("#adminPlaylistSelect");
const adminPlayerControls = $("#adminPlayerControls");
const adminEndControls = $("#adminEndControls");
const adminStatus = $("#adminStatus");

function redirectLocalhostToLoopback() {
  if (location.hostname !== "localhost" && location.hostname !== "::1" && location.hostname !== "[::1]") return false;
  const url = new URL(location.href);
  url.hostname = "127.0.0.1";
  location.replace(url.href);
  return true;
}

if (redirectLocalhostToLoopback()) await new Promise(() => {});

const roomId = new URLSearchParams(location.search).get("room") || "";
const playerStorageKey = `en_una_nota_player_id_${roomId}`;
let playerId = localStorage.getItem(playerStorageKey) || crypto.randomUUID();
let eventSource = null;
let state = null;
let isAdmin = false;
let hostHeartbeatId = null;

localStorage.setItem(playerStorageKey, playerId);
playerName.value = localStorage.getItem("en_una_nota_name") || "";

function room() {
  return roomId;
}

function api(path, body) {
  return fetch(`${path}?room=${encodeURIComponent(room())}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  }).then(response => response.json());
}

function stopHostHeartbeat() {
  if (hostHeartbeatId === null) return;
  window.clearInterval(hostHeartbeatId);
  hostHeartbeatId = null;
}

function startHostHeartbeat() {
  stopHostHeartbeat();
  hostHeartbeatId = window.setInterval(async () => {
    const result = await api("/api/host-heartbeat", { adminKey: roomId, playerId });
    if (result.error) revokeHostControls(result.error);
  }, 15_000);
}

function revokeHostControls(message = "Host no disponible") {
  isAdmin = false;
  stopHostHeartbeat();
  adminControls.classList.add("hidden");
  hello.textContent = playerName.value.trim();
  adminStatus.textContent = translateServerMessage(message);
}

async function join() {
  const name = playerName.value.trim();
  const typedAdminKey = adminKey.value.trim();
  joinError.textContent = "";
  if (!roomId) {
    joinError.textContent = t("player.roomRequired");
    return;
  }
  if (!name) {
    playerName.focus();
    return;
  }
  const normalizedHostKey = typedAdminKey.toUpperCase();
  const normalizedRoomId = roomId.toUpperCase();
  if (typedAdminKey && normalizedHostKey !== normalizedRoomId) {
    joinError.textContent = t("player.wrongHostKey");
    adminKey.focus();
    return;
  }
  const wantsHost = Boolean(typedAdminKey) && normalizedHostKey === normalizedRoomId;
  localStorage.setItem("en_una_nota_name", name);
  localStorage.setItem("en_una_nota_room", room());
  const result = await api("/api/join", { id: playerId, name, isHost: wantsHost });
  if (result.error) {
    joinError.textContent = translateServerMessage(result.error);
    return;
  }
  isAdmin = Boolean(result.isHost);
  joinScreen.classList.add("hidden");
  joinScreen.hidden = true;
  joinScreen.setAttribute("aria-hidden", "true");
  buzzerScreen.classList.remove("hidden");
  buzzerScreen.hidden = false;
  buzzerScreen.removeAttribute("aria-hidden");
  adminControls.classList.toggle("hidden", !isAdmin);
  hello.textContent = isAdmin ? `${t("player.hostLabel")} - ${roomId.toUpperCase()}` : name;
  if (isAdmin) startHostHeartbeat();
  connectEvents();
}

async function hostCommand(action, extra = {}) {
  if (!isAdmin) return;
  adminStatus.textContent = t("player.sendingControl");
  const result = await api("/api/host-command", { adminKey: roomId, hostPlayerId: playerId, action, ...extra });
  if (result.error) {
    adminStatus.textContent = translateServerMessage(result.error);
    if (result.error === "Clave admin incorrecta" || result.error === "Host no disponible") {
      revokeHostControls(result.error);
    }
    return;
  }
  adminStatus.textContent = t("player.controlSent");
}

async function voteGoldenGoal(accept) {
  const result = await api("/api/golden-vote", { playerId, accept });
  if (result.error) {
    buzzState.textContent = translateServerMessage(result.error);
    return;
  }
  state = result.room;
  render();
}

function connectEvents() {
  eventSource?.close();
  eventSource = new EventSource(`/events?room=${encodeURIComponent(room())}`);
  eventSource.onmessage = event => {
    state = JSON.parse(event.data);
    render();
  };
}

function render() {
  const players = state?.players || [];
  const me = players.find(player => player.id === playerId);
  if (!me) return;
  const myRank = players.findIndex(player => player.id === playerId) + 1;
  const buzzed = state.buzzes.some(buzz => buzz.playerId === playerId);
  const first = state.buzzes[0]?.playerId === playerId;
  const eliminated = Boolean(state.round?.eliminatedPlayerIds?.includes(playerId));
  const roundActive = Boolean(
    state.round &&
    state.round.acceptBuzzes !== false &&
    !state.round.revealed &&
    !state.gameOver &&
    !state.goldenVote?.active &&
    !eliminated
  );
  const vote = state.goldenVote;
  const myVote = vote?.votes?.[playerId];
  buzzerScreen.classList.toggle("golden-goal-active", Boolean(state.goldenGoal));
  playerScore.textContent = `${me.score} ${t("common.points")}`;
  rank.textContent = `#${myRank}`;
  buzzButton.classList.toggle("buzzed", buzzed);
  buzzButton.disabled = buzzed || !roundActive;
  buzzButton.textContent = roundActive ? "BUZZ" : t("player.readyButton");
  roundState.textContent = state.round?.revealed
    ? `${state.round.track.name} - ${state.round.track.artists}`
    : state.round?.hostReviewing
      ? t("player.hostReviewing")
    : roundActive
      ? t("player.activeRound")
      : t("player.noActiveRound");
  if (first) {
    buzzState.textContent = t("player.first");
  } else if (buzzed) {
    buzzState.textContent = t("player.buzzReceivedHost");
  } else if (eliminated) {
    buzzState.textContent = t("player.missedRound");
  } else if (roundActive) {
    buzzState.textContent = t("player.pressWhenKnow");
  } else if (state.round?.hostReviewing) {
    buzzState.textContent = t("player.hostReviewingDetail");
  } else if (state.round?.revealed) {
    buzzState.textContent = t("player.answerRevealed");
  } else {
    buzzState.textContent = t("player.waitNext");
  }
  goldenVoteBox.classList.toggle("hidden", !vote?.active);
  if (vote?.active) {
    goldenVoteText.textContent = `${vote.yes || 0} ${t("common.yes")} / ${vote.no || 0} ${t("common.no")} - ${t("common.requires")} ${vote.required || 0} ${t("common.of")} ${vote.total || 0}`;
    acceptGoldenVote.classList.toggle("selected", myVote === true);
    rejectGoldenVote.classList.toggle("selected", myVote === false);
  }
  renderAdminControls(players);
}

function renderAdminControls(players) {
  if (!isAdmin) return;
  renderAdminPlaylistSelector();
  adminEndControls?.classList.toggle("hidden", !state?.gameOver);
  adminPlayerControls.innerHTML = "";
  const playersById = new Map(players.map(player => [player.id, player]));
  const buzzes = state?.buzzes || [];
  if (!buzzes.length) {
    adminPlayerControls.innerHTML = `<p class="muted">${t("player.waitingBuzzOrder")}</p>`;
    return;
  }
  for (const buzz of buzzes) {
    const player = playersById.get(buzz.playerId);
    if (!player) continue;
    const row = document.createElement("div");
    row.className = "admin-player-row";
    row.innerHTML = `<strong>${player.name}</strong><span>${player.score} ${t("common.points")}</span><button data-player="${player.id}" data-delta="1">+1</button><button data-player="${player.id}" data-delta="-1">-1</button>`;
    adminPlayerControls.append(row);
  }
  if (!adminPlayerControls.children.length) {
    adminPlayerControls.innerHTML = `<p class="muted">${t("player.waitingBuzzOrder")}</p>`;
  }
}

function renderAdminPlaylistSelector() {
  if (!adminPlaylistSelect) return;
  const options = Array.isArray(state?.playlistOptions) ? state.playlistOptions : [];
  adminPlaylistSelect.innerHTML = "";
  if (!options.length) {
    adminPlaylistSelect.disabled = true;
    const option = document.createElement("option");
    option.value = "";
    option.textContent = t("player.playlistUnavailable");
    adminPlaylistSelect.append(option);
    return;
  }
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = t("player.selectPlaylist");
  adminPlaylistSelect.append(placeholder);
  for (const playlist of options) {
    const option = document.createElement("option");
    option.value = playlist.id;
    option.textContent = `${playlist.name} (${playlist.tracks || 0})`;
    option.selected = playlist.id === state?.playlistId;
    adminPlaylistSelect.append(option);
  }
  adminPlaylistSelect.disabled = false;
}

function refreshLanguage() {
  translatePage();
  if (!state) {
    hello.textContent = t("player.ready");
    roundState.textContent = t("player.noActiveRound");
    buzzState.textContent = t("player.waitSong");
  } else {
    render();
  }
}

initLanguageControls(refreshLanguage);
refreshLanguage();

joinGame.addEventListener("click", join);
playerName.addEventListener("keydown", event => {
  if (event.key === "Enter") join();
});
adminKey.addEventListener("keydown", event => {
  if (event.key === "Enter") join();
});
acceptGoldenVote.addEventListener("click", () => voteGoldenGoal(true));
rejectGoldenVote.addEventListener("click", () => voteGoldenGoal(false));
buzzButton.addEventListener("click", async () => {
  navigator.vibrate?.([35, 20, 35]);
  buzzButton.classList.add("buzzed");
  buzzButton.disabled = true;
  buzzState.textContent = t("player.buzzSent");
  const result = await api("/api/buzz", { playerId });
  if (result.error) {
    buzzButton.classList.remove("buzzed");
    buzzState.textContent = translateServerMessage(result.error);
    if (result.error === "Ya fallaste esta ronda") {
      buzzButton.disabled = true;
    } else {
      render();
    }
  }
});
adminControls.addEventListener("click", event => {
  const actionButton = event.target.closest("button[data-host-action]");
  const scoreButton = event.target.closest("button[data-player]");
  if (actionButton) {
    hostCommand(actionButton.dataset.hostAction);
    return;
  }
  if (scoreButton) {
    hostCommand("score", {
      playerId: scoreButton.dataset.player,
      delta: Number(scoreButton.dataset.delta)
    });
  }
});
adminPlaylistSelect?.addEventListener("change", event => {
  const playlistId = event.target.value;
  if (!playlistId) return;
  hostCommand("select-playlist", { target: playlistId });
});

window.addEventListener("pagehide", stopHostHeartbeat);
