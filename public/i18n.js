const STORAGE_KEY = "en_una_nota_language";

const translations = {
  es: {
    "common.spanish": "Español",
    "common.english": "English",
    "common.language": "Idioma",
    "common.spotifyDisconnected": "Spotify sin conectar",
    "common.playlist": "Playlist",
    "common.playlistUnloaded": "Playlist sin cargar",
    "common.song": "Cancion",
    "common.artist": "Artista",
    "common.player": "Jugador",
    "common.players": "Jugadores",
    "common.winner": "Ganador",
    "common.points": "pts",
    "common.yes": "si",
    "common.no": "no",
    "common.requires": "requiere",
    "common.of": "de",
    "common.copied": "Copiado",
    "common.joinQrAlt": "QR para unir buzzers",

    "host.connectSpotify": "Conectar Spotify",
    "host.disconnectSpotify": "Desconectar",
    "host.changeLanguage": "Cambiar idioma",
    "host.enterGame": "Entrar al juego",
    "host.welcomeEyebrow": "Juego musical de fiesta",
    "host.welcomeTitle": "En Una Nota",
    "host.welcomeSubtitle": "Elige idioma para preparar la partida.",
    "host.chooseLanguage": "Idioma",
    "host.welcomeSpotifyHint": "Puedes cambiar el idioma despues desde la pantalla del juego.",
    "host.reviewingTitle": "El host esta revisando",
    "host.reviewingDetail": "Espera la decision del anfitrion.",
    "host.yourPlaylists": "Tus playlists",
    "host.refresh": "Actualizar",
    "host.connectToSeePlaylists": "Conecta Spotify para ver tus playlists.",
    "host.openPlayer": "Abre /player",
    "host.goldenVoteProposed": "Buzz de Oro propuesto",
    "host.play": "Reproducir",
    "host.replay": "Repetir",
    "host.reveal": "Mostrar",
    "host.continue": "Continuar",
    "host.fullSong": "Completa",
    "host.pause": "Pausar",
    "host.timer10": "Timer 10s",
    "host.goldenGoal": "Buzz de Oro",
    "host.continueWarning": "Al continuar la cancion, solo vale decir el nombre: no tararear, cantar ni hacer melodias.",
    "host.responseOrder": "Orden de respuesta",
    "host.clearBuzzers": "Limpiar buzzers",
    "host.scores": "Puntajes",
    "host.resetGame": "Reiniciar juego",
    "host.continueMatch": "Continuar",
    "host.choosePlaylist": "Elegir otra playlist",
    "host.close": "Cerrar",
    "host.beforeStart": "Antes de empezar",
    "host.rulesTitle": "Reglas de En Una Nota",
    "host.rule1": "Durante los primeros 10 segundos vale tararear, cantar o decir el nombre de la cancion; si el host presiona Continuar, SOLO vale decir el nombre de la cancion.",
    "host.rule2": "Si respondes mal, pierdes 1 punto y pasa el turno al siguiente buzzer.",
    "host.rule3": "Si nadie la sabe, el host puede mostrar la respuesta o pasar a una nueva ronda.",
    "host.understood": "Entendido",

    "host.status.addClientId": "Agrega tu Client ID de Spotify",
    "host.status.openingSpotify": "Abriendo login de Spotify...",
    "host.status.spotifyDisconnected": "Spotify desconectado",
    "host.status.spotifyNotConnected": "Spotify sin conectar",
    "host.status.invalidServerResponse": "Respuesta invalida del servidor",
    "host.status.connectedLoadPlaylist": "Spotify conectado. Carga una playlist para iniciar el reproductor.",
    "host.status.cannotConnectSpotify": "No se pudo conectar Spotify",
    "host.status.stateMismatch": "Spotify devolvio una sesion distinta. Conecta otra vez.",
    "host.status.connected": "Spotify conectado",
    "host.status.allPlayedReset": "Todas las canciones sonaron. Reiniciando lista.",
    "host.status.buzzPaused": "Buzz recibido. Musica pausada",
    "host.status.reconnectSpotify": "Conecta Spotify otra vez",
    "host.status.screenDeviceMissing": "Spotify no registro esta pantalla como dispositivo",
    "host.status.startingPlayer": "Spotify autorizado, iniciando reproductor...",
    "host.status.sdkFailed": "No se pudo cargar Spotify Web Playback SDK",
    "host.status.readyToPlay": "Spotify listo para jugar",
    "host.status.premiumRequired": "Spotify Premium requerido",
    "host.status.playbackError": "Error de reproduccion",
    "host.status.playerFailed": "Spotify no pudo conectar el reproductor web",
    "host.status.connectFirst": "Conecta Spotify primero",
    "host.status.screenNotReady": "El reproductor de esta pantalla aun no esta listo",
    "host.status.screenActive": "Esta pantalla quedo activa para reproducir",
    "host.status.chooseValidPlaylist": "Elige una playlist valida",
    "host.status.noPlaylists": "No encontramos playlists en esta cuenta.",
    "host.status.loadingPlaylists": "Cargando playlists...",
    "host.status.waitGoldenVote": "Espera a que termine la votacion de Buzz de Oro",
    "host.status.gameOver": "La partida termino. Continua o elige otra playlist.",
    "host.status.openDevicePlay": "Abre Spotify en algun dispositivo y presiona reproducir otra vez.",
    "host.status.loadPlaylistFirst": "Carga una playlist primero",
    "host.status.noSongs": "No hay canciones disponibles",
    "host.status.noFragment": "No hay fragmento para repetir",
    "host.status.fragmentRepeated": "Fragmento repetido",
    "host.status.answerShown": "Respuesta mostrada",
    "host.status.noAnswer": "No hay respuesta para mostrar",
    "host.status.songPaused": "Cancion pausada",
    "host.status.noSongContinue": "No hay cancion para continuar",
    "host.status.openDeviceContinue": "Abre Spotify en algun dispositivo y presiona continuar otra vez.",
    "host.status.alreadyPlayed30": "Ya se reprodujeron 30 segundos de esta cancion",
    "host.status.continuing30": "Cancion continuando hasta 30s",
    "host.status.fullPlaying": "Cancion completa reproduciendo",
    "host.status.continuationPaused30": "Continuacion pausada a los 30s",
    "host.status.voteStarted": "Votacion de Buzz de Oro iniciada",
    "host.status.matchReady": "Partida lista para continuar",
    "host.status.choosePlaylistRestart": "Elige una playlist para reiniciar la partida",
    "host.status.cannotOpenSpotify": "No se pudo abrir Spotify",
    "host.status.finalSongFailed": "No se pudo reproducir la cancion final",
    "host.status.hostCommandFailed": "No se pudo ejecutar control host",
    "host.status.activateScreenFailed": "No se pudo activar esta pantalla",
    "host.status.disconnectFailed": "No se pudo desconectar Spotify",
    "host.status.copyFailed": "No se pudo copiar el enlace",
    "host.status.reactivatePlayer": "Spotify conectado. Reactiva el reproductor si no suena en pantalla",
    "host.status.playlistForbidden": "Forbidden",
    "host.status.playlistsFailed": "No se pudieron cargar playlists",
    "host.status.owner": "Dueno",
    "host.status.yourUser": "Tu usuario",
    "host.status.unknown": "desconocido",
    "host.status.restartConfirm": "Reiniciar jugadores y puntajes?",
    "host.status.waitingBuzzers": "Esperando buzzers.",
    "host.status.waitingPlayers": "Esperando jugadores...",
    "host.status.goldenActive": "Buzz de Oro activo",
    "host.status.goldenRejected": "Buzz de Oro rechazado",
    "host.status.nextCorrectWins": "El proximo acierto gana",
    "host.status.round": "Ronda",
    "host.status.roundEmpty": "Ronda --",
    "host.status.answer": "Respuesta",
    "host.status.winnerSuffix": " - Ganador",
    "host.status.loadedSongs": "{count} canciones cargadas. Reproduce una ronda para iniciar Spotify.",
    "host.status.zeroSongs": "0 canciones. Items: {items}, tracks: {tracks}, no tracks: {nonTracks}",

    "player.buzzerTitle": "Tu buzzer",
    "player.name": "Nombre",
    "player.namePlaceholder": "Tu nombre",
    "player.hostKey": "Clave host",
    "player.optional": "opcional",
    "player.hostPlaceholder": "Solo para host",
    "player.enter": "Entrar",
    "player.ready": "Listo",
    "player.readyButton": "LISTO",
    "player.noActiveRound": "Sin ronda activa",
    "player.waitSong": "Espera la cancion...",
    "player.voteActive": "Votacion activa",
    "player.accept": "Aceptar",
    "player.reject": "Rechazar",
    "player.adminControls": "Controles host",
    "player.clear": "Limpiar",
    "player.continueGame": "Continuar partida",
    "player.choosePlaylist": "Elegir otra playlist",
    "player.wrongHostKey": "Clave host incorrecta",
    "player.sendingControl": "Enviando control...",
    "player.controlSent": "Control enviado al host.",
    "player.activeRound": "Ronda en juego",
    "player.hostReviewing": "El host esta revisando",
    "player.hostReviewingDetail": "Espera la decision del anfitrion.",
    "player.first": "Primero. Te toca responder.",
    "player.buzzReceivedHost": "Buzz recibido. Espera al anfitrion.",
    "player.missedRound": "Ya fallaste esta ronda. Espera la siguiente.",
    "player.pressWhenKnow": "Presiona cuando sepas la cancion.",
    "player.answerRevealed": "Respuesta revelada. Espera la siguiente ronda.",
    "player.waitNext": "Espera la siguiente ronda.",
    "player.waitingBuzzOrder": "Esperando orden de buzzers...",
    "player.buzzSent": "Buzz enviado."
  },
  en: {
    "common.spanish": "Español",
    "common.english": "English",
    "common.language": "Language",
    "common.spotifyDisconnected": "Spotify not connected",
    "common.playlist": "Playlist",
    "common.playlistUnloaded": "No playlist loaded",
    "common.song": "Song",
    "common.artist": "Artist",
    "common.player": "Player",
    "common.players": "Players",
    "common.winner": "Winner",
    "common.points": "pts",
    "common.yes": "yes",
    "common.no": "no",
    "common.requires": "needs",
    "common.of": "of",
    "common.copied": "Copied",
    "common.joinQrAlt": "QR to join buzzers",

    "host.connectSpotify": "Connect Spotify",
    "host.disconnectSpotify": "Disconnect",
    "host.changeLanguage": "Change language",
    "host.enterGame": "Enter game",
    "host.welcomeEyebrow": "Music party game",
    "host.welcomeTitle": "En Una Nota",
    "host.welcomeSubtitle": "Choose a language to set up the game.",
    "host.chooseLanguage": "Language",
    "host.welcomeSpotifyHint": "You can change the language later from the game screen.",
    "host.reviewingTitle": "The host is reviewing",
    "host.reviewingDetail": "Wait for the host's decision.",
    "host.yourPlaylists": "Your playlists",
    "host.refresh": "Refresh",
    "host.connectToSeePlaylists": "Connect Spotify to see your playlists.",
    "host.openPlayer": "Open /player",
    "host.goldenVoteProposed": "Golden Buzz proposed",
    "host.play": "Play",
    "host.replay": "Replay",
    "host.reveal": "Reveal",
    "host.continue": "Continue",
    "host.fullSong": "Full song",
    "host.pause": "Pause",
    "host.timer10": "10s Timer",
    "host.goldenGoal": "Golden Buzz",
    "host.continueWarning": "After continuing the song, only the song title counts: no humming, singing, or melodies.",
    "host.responseOrder": "Answer order",
    "host.clearBuzzers": "Clear buzzers",
    "host.scores": "Scores",
    "host.resetGame": "Reset game",
    "host.continueMatch": "Continue",
    "host.choosePlaylist": "Choose another playlist",
    "host.close": "Close",
    "host.beforeStart": "Before starting",
    "host.rulesTitle": "En Una Nota Rules",
    "host.rule1": "During the first 10 seconds, humming, singing, or saying the song title is allowed; if the host presses Continue, ONLY the song title counts.",
    "host.rule2": "If you answer incorrectly, you lose 1 point and the turn goes to the next buzzer.",
    "host.rule3": "If nobody knows the song, the host can reveal the answer or move to a new round.",
    "host.understood": "Got it",

    "host.status.addClientId": "Add your Spotify Client ID",
    "host.status.openingSpotify": "Opening Spotify login...",
    "host.status.spotifyDisconnected": "Spotify disconnected",
    "host.status.spotifyNotConnected": "Spotify not connected",
    "host.status.invalidServerResponse": "Invalid server response",
    "host.status.connectedLoadPlaylist": "Spotify connected. Load a playlist to start the player.",
    "host.status.cannotConnectSpotify": "Could not connect Spotify",
    "host.status.stateMismatch": "Spotify returned a different session. Connect again.",
    "host.status.connected": "Spotify connected",
    "host.status.allPlayedReset": "All songs have played. Restarting the list.",
    "host.status.buzzPaused": "Buzz received. Music paused",
    "host.status.reconnectSpotify": "Connect Spotify again",
    "host.status.screenDeviceMissing": "Spotify did not register this screen as a device",
    "host.status.startingPlayer": "Spotify authorized, starting player...",
    "host.status.sdkFailed": "Could not load Spotify Web Playback SDK",
    "host.status.readyToPlay": "Spotify ready to play",
    "host.status.premiumRequired": "Spotify Premium required",
    "host.status.playbackError": "Playback error",
    "host.status.playerFailed": "Spotify could not connect the web player",
    "host.status.connectFirst": "Connect Spotify first",
    "host.status.screenNotReady": "This screen's player is not ready yet",
    "host.status.screenActive": "This screen is active for playback",
    "host.status.chooseValidPlaylist": "Choose a valid playlist",
    "host.status.noPlaylists": "No playlists found in this account.",
    "host.status.loadingPlaylists": "Loading playlists...",
    "host.status.waitGoldenVote": "Wait for the Golden Buzz vote to finish",
    "host.status.gameOver": "The game is over. Continue or choose another playlist.",
    "host.status.openDevicePlay": "Open Spotify on a device and press play again.",
    "host.status.loadPlaylistFirst": "Load a playlist first",
    "host.status.noSongs": "No songs available",
    "host.status.noFragment": "No clip to replay",
    "host.status.fragmentRepeated": "Clip replayed",
    "host.status.answerShown": "Answer revealed",
    "host.status.noAnswer": "No answer to reveal",
    "host.status.songPaused": "Song paused",
    "host.status.noSongContinue": "No song to continue",
    "host.status.openDeviceContinue": "Open Spotify on a device and press continue again.",
    "host.status.alreadyPlayed30": "This song has already played for 30 seconds",
    "host.status.continuing30": "Song continuing up to 30s",
    "host.status.fullPlaying": "Full song playing",
    "host.status.continuationPaused30": "Continuation paused at 30s",
    "host.status.voteStarted": "Golden Buzz vote started",
    "host.status.matchReady": "Game ready to continue",
    "host.status.choosePlaylistRestart": "Choose a playlist to restart the game",
    "host.status.cannotOpenSpotify": "Could not open Spotify",
    "host.status.finalSongFailed": "Could not play the final song",
    "host.status.hostCommandFailed": "Could not run host control",
    "host.status.activateScreenFailed": "Could not activate this screen",
    "host.status.disconnectFailed": "Could not disconnect Spotify",
    "host.status.copyFailed": "Could not copy link",
    "host.status.reactivatePlayer": "Spotify connected. Reactivate the player if it does not play on this screen",
    "host.status.playlistForbidden": "Forbidden",
    "host.status.playlistsFailed": "Could not load playlists",
    "host.status.owner": "Owner",
    "host.status.yourUser": "Your user",
    "host.status.unknown": "unknown",
    "host.status.restartConfirm": "Reset players and scores?",
    "host.status.waitingBuzzers": "Waiting for buzzers.",
    "host.status.waitingPlayers": "Waiting for players...",
    "host.status.goldenActive": "Golden Buzz active",
    "host.status.goldenRejected": "Golden Buzz rejected",
    "host.status.nextCorrectWins": "The next correct answer wins",
    "host.status.round": "Round",
    "host.status.roundEmpty": "Round --",
    "host.status.answer": "Answer",
    "host.status.winnerSuffix": " - Winner",
    "host.status.loadedSongs": "{count} songs loaded. Play a round to start Spotify.",
    "host.status.zeroSongs": "0 songs. Items: {items}, tracks: {tracks}, non-tracks: {nonTracks}",

    "player.buzzerTitle": "Your buzzer",
    "player.name": "Name",
    "player.namePlaceholder": "Your name",
    "player.hostKey": "Host key",
    "player.optional": "optional",
    "player.hostPlaceholder": "Host only",
    "player.enter": "Enter",
    "player.ready": "Ready",
    "player.readyButton": "READY",
    "player.noActiveRound": "No active round",
    "player.waitSong": "Wait for the song...",
    "player.voteActive": "Vote active",
    "player.accept": "Accept",
    "player.reject": "Reject",
    "player.adminControls": "Host controls",
    "player.clear": "Clear",
    "player.continueGame": "Continue game",
    "player.choosePlaylist": "Choose another playlist",
    "player.wrongHostKey": "Incorrect host key",
    "player.sendingControl": "Sending control...",
    "player.controlSent": "Control sent to host.",
    "player.activeRound": "Round in play",
    "player.hostReviewing": "The host is reviewing",
    "player.hostReviewingDetail": "Wait for the host's decision.",
    "player.first": "First. Your turn to answer.",
    "player.buzzReceivedHost": "Buzz received. Wait for the host.",
    "player.missedRound": "You missed this round. Wait for the next one.",
    "player.pressWhenKnow": "Press when you know the song.",
    "player.answerRevealed": "Answer revealed. Wait for the next round.",
    "player.waitNext": "Wait for the next round.",
    "player.waitingBuzzOrder": "Waiting for buzzer order...",
    "player.buzzSent": "Buzz sent."
  }
};

const serverMessages = {
  "Nombre requerido": { es: "Nombre requerido", en: "Name required" },
  "Ese nombre ya esta en uso": { es: "Ese nombre ya esta en uso", en: "That name is already in use" },
  "Jugador no encontrado": { es: "Jugador no encontrado", en: "Player not found" },
  "No hay una ronda activa": { es: "No hay una ronda activa", en: "There is no active round" },
  "Ya fallaste esta ronda": { es: "Ya fallaste esta ronda", en: "You already missed this round" },
  "Puntaje invalido": { es: "Puntaje invalido", en: "Invalid score" },
  "Clave admin incorrecta": { es: "Clave admin incorrecta", en: "Incorrect admin key" },
  "Control invalido": { es: "Control invalido", en: "Invalid control" },
  "Buzz de Oro requiere un jugador con 9 puntos o mas": {
    es: "Buzz de Oro requiere un jugador con 9 puntos o mas",
    en: "Golden Buzz requires at least one player with 9 or more points"
  },
  "No hay jugadores para votar": { es: "No hay jugadores para votar", en: "There are no players to vote" },
  "La partida ya termino": { es: "La partida ya termino", en: "The game is already over" },
  "Buzz de Oro ya esta activo": { es: "Buzz de Oro ya esta activo", en: "Golden Buzz is already active" },
  "Ya hay una votacion activa": { es: "Ya hay una votacion activa", en: "There is already an active vote" },
  "No hay votacion activa": { es: "No hay votacion activa", en: "There is no active vote" },
  "La partida termino. Continua o elige otra playlist.": {
    es: "La partida termino. Continua o elige otra playlist.",
    en: "The game is over. Continue or choose another playlist."
  },
  "Hay una votacion de Buzz de Oro activa": {
    es: "Hay una votacion de Buzz de Oro activa",
    en: "There is an active Golden Buzz vote"
  },
  "Spotify no conectado": { es: "Spotify no conectado", en: "Spotify not connected" },
  "Playlist ID invalido": { es: "Playlist ID invalido", en: "Invalid playlist ID" },
  "Method not allowed": { es: "Metodo no permitido", en: "Method not allowed" },
  "Not found": { es: "No encontrado", en: "Not found" }
};

function normalizeLanguage(value) {
  return value === "en" ? "en" : "es";
}

export function getLanguage() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return normalizeLanguage(stored);
  return navigator.language?.toLowerCase().startsWith("en") ? "en" : "es";
}

export function setLanguage(language) {
  const normalized = normalizeLanguage(language);
  localStorage.setItem(STORAGE_KEY, normalized);
  document.documentElement.lang = normalized;
  translatePage();
  window.dispatchEvent(new CustomEvent("languagechange", { detail: { language: normalized } }));
}

export function t(key, values = {}) {
  const language = getLanguage();
  const dictionary = translations[language] || translations.es;
  const template = dictionary[key] || translations.es[key] || key;
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template
  );
}

export function translateServerMessage(message) {
  const entry = serverMessages[String(message || "")];
  return entry?.[getLanguage()] || message;
}

function applyElementTranslation(element) {
  const key = element.dataset.i18n;
  if (key) element.textContent = t(key);
  const placeholderKey = element.dataset.i18nPlaceholder;
  if (placeholderKey) element.setAttribute("placeholder", t(placeholderKey));
  const titleKey = element.dataset.i18nTitle;
  if (titleKey) element.setAttribute("title", t(titleKey));
  const ariaKey = element.dataset.i18nAriaLabel;
  if (ariaKey) element.setAttribute("aria-label", t(ariaKey));
  const altKey = element.dataset.i18nAlt;
  if (altKey) element.setAttribute("alt", t(altKey));
}

export function translatePage(root = document) {
  document.documentElement.lang = getLanguage();
  root.querySelectorAll("[data-i18n], [data-i18n-placeholder], [data-i18n-title], [data-i18n-aria-label], [data-i18n-alt]")
    .forEach(applyElementTranslation);
  root.querySelectorAll("[data-lang-choice]").forEach(button => {
    const active = button.dataset.langChoice === getLanguage();
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

export function initLanguageControls(onChange) {
  translatePage();
  document.querySelectorAll("[data-lang-choice]").forEach(button => {
    button.addEventListener("click", () => {
      setLanguage(button.dataset.langChoice);
      onChange?.(getLanguage());
    });
  });
}
