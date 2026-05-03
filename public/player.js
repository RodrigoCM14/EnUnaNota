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
const adminControls = $("#adminControls");
const adminPlayerControls = $("#adminPlayerControls");
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
    joinError.textContent = "Clave host incorrecta";
    adminKey.focus();
    return;
  }
  isAdmin = typedAdminKey === "2312";
  localStorage.setItem("en_una_nota_name", name);
  localStorage.setItem("en_una_nota_room", room());
  const result = await api("/api/join", { id: playerId, name });
  if (result.error) {
    joinError.textContent = result.error;
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
  adminStatus.textContent = "Enviando control...";
  const result = await api("/api/host-command", { adminKey: "2312", action, ...extra });
  if (result.error) {
    adminStatus.textContent = result.error;
    return;
  }
  adminStatus.textContent = "Control enviado al host.";
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
  const roundActive = Boolean(state.round && !state.round.revealed);
  playerScore.textContent = `${me.score} pts`;
  rank.textContent = `#${myRank}`;
  buzzButton.classList.toggle("buzzed", buzzed);
  buzzButton.disabled = buzzed || !roundActive;
  buzzButton.textContent = roundActive ? "BUZZ" : "LISTO";
  roundState.textContent = state.round?.revealed
    ? `${state.round.track.name} - ${state.round.track.artists}`
    : roundActive
      ? "Ronda en juego"
      : "Sin ronda activa";
  if (first) {
    buzzState.textContent = "Primero. Te toca responder.";
  } else if (buzzed) {
    buzzState.textContent = "Buzz recibido. Espera al anfitrion.";
  } else if (roundActive) {
    buzzState.textContent = "Presiona cuando sepas la cancion.";
  } else if (state.round?.revealed) {
    buzzState.textContent = "Respuesta revelada. Espera la siguiente ronda.";
  } else {
    buzzState.textContent = "Espera la siguiente ronda.";
  }
  renderAdminControls(players);
}

function renderAdminControls(players) {
  if (!isAdmin) return;
  adminPlayerControls.innerHTML = "";
  if (!players.length) {
    adminPlayerControls.innerHTML = `<p class="muted">Esperando jugadores...</p>`;
    return;
  }
  for (const player of players) {
    const row = document.createElement("div");
    row.className = "admin-player-row";
    row.innerHTML = `<strong>${player.name}</strong><span>${player.score} pts</span><button data-player="${player.id}" data-delta="1">+1</button><button data-player="${player.id}" data-delta="-1">-1</button>`;
    adminPlayerControls.append(row);
  }
}

joinGame.addEventListener("click", join);
playerName.addEventListener("keydown", event => {
  if (event.key === "Enter") join();
});
adminKey.addEventListener("keydown", event => {
  if (event.key === "Enter") join();
});
buzzButton.addEventListener("click", async () => {
  navigator.vibrate?.([35, 20, 35]);
  buzzButton.classList.add("buzzed");
  buzzButton.disabled = true;
  buzzState.textContent = "Buzz enviado.";
  const result = await api("/api/buzz", { playerId });
  if (result.error) {
    buzzButton.classList.remove("buzzed");
    buzzState.textContent = result.error;
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
