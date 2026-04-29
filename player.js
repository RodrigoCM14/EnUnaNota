const $ = selector => document.querySelector(selector);

const joinScreen = $("#joinScreen");
const buzzerScreen = $("#buzzerScreen");
const playerName = $("#playerName");
const playerRoom = $("#playerRoom");
const joinGame = $("#joinGame");
const buzzButton = $("#buzzButton");
const hello = $("#hello");
const playerScore = $("#playerScore");
const rank = $("#rank");
const roundState = $("#roundState");
const buzzState = $("#buzzState");

let playerId = localStorage.getItem("en_una_nota_player_id") || crypto.randomUUID();
let eventSource = null;
let state = null;

localStorage.setItem("en_una_nota_player_id", playerId);
playerRoom.value = new URLSearchParams(location.search).get("room") || localStorage.getItem("en_una_nota_room") || "default";
playerName.value = localStorage.getItem("en_una_nota_name") || "";

function room() {
  return playerRoom.value.trim() || "default";
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
  if (!name) {
    playerName.focus();
    return;
  }
  localStorage.setItem("en_una_nota_name", name);
  localStorage.setItem("en_una_nota_room", room());
  const result = await api("/api/join", { id: playerId, name });
  if (result.error) {
    buzzState.textContent = result.error;
    return;
  }
  joinScreen.classList.add("hidden");
  buzzerScreen.classList.remove("hidden");
  hello.textContent = name;
  connectEvents();
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
}

joinGame.addEventListener("click", join);
playerName.addEventListener("keydown", event => {
  if (event.key === "Enter") join();
});
buzzButton.addEventListener("click", async () => {
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
