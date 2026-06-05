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
const adminPlayerControls = $("#adminPlayerControls");
const adminEndControls = $("#adminEndControls");
const adminStatus = $("#adminStatus");

let playerId = localStorage.getItem("en_una_nota_player_id") || crypto.randomUUID();
const roomId = new URLSearchParams(location.search).get("room") || localStorage.getItem("en_una_nota_room") || "default";
let eventSource = null;
let state = null;
let isAdmin = false;

localStorage.setItem("en_una_nota_player_id", playerId);
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

async function join() {
  const name = playerName.value.trim();
  const typedAdminKey = adminKey.value.trim();
  joinError.textContent = "";
  if (!name) {
    playerName.focus();
    return;
  }
  if (typedAdminKey && typedAdminKey !== "2312") {
    joinError.textContent = t("player.wrongHostKey");
    adminKey.focus();
    return;
  }
  isAdmin = typedAdminKey === "2312";
  localStorage.setItem("en_una_nota_name", name);
  localStorage.setItem("en_una_nota_room", room());
  const result = await api("/api/join", { id: playerId, name });
  if (result.error) {
    joinError.textContent = translateServerMessage(result.error);
    return;
  }
  joinScreen.classList.add("hidden");
  buzzerScreen.classList.remove("hidden");
  adminControls.classList.toggle("hidden", !isAdmin);
  hello.textContent = name;
  connectEvents();
}

async function hostCommand(action, extra = {}) {
  if (!isAdmin) return;
  adminStatus.textContent = t("player.sendingControl");
  const result = await api("/api/host-command", { adminKey: "2312", action, ...extra });
  if (result.error) {
    adminStatus.textContent = translateServerMessage(result.error);
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
  const roundActive = Boolean(state.round && !state.round.revealed && !state.gameOver && !state.goldenVote?.active);
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
    : roundActive
      ? t("player.activeRound")
      : t("player.noActiveRound");
  if (first) {
    buzzState.textContent = t("player.first");
  } else if (buzzed) {
    buzzState.textContent = t("player.buzzReceivedHost");
  } else if (roundActive) {
    buzzState.textContent = t("player.pressWhenKnow");
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
    render();
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
