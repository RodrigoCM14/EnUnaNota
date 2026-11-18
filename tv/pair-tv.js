// La TV muestra la vinculación dentro de la pantalla principal, sin bloquearla.
let tvPairGeneration = 0;
let tvPairInProgress = false;
let tvSdkRequested = false;
function showTvPairing() {
  const panel = document.getElementById('tvSpotifyPair');
  panel.hidden = false;
  if (!tvPairInProgress) startTvPairing();
}
function hideTvPairing() {
  ++tvPairGeneration;
  tvPairInProgress = false;
  document.getElementById('tvSpotifyPair').hidden = true;
}
function loadTvSpotifySdk() {
  if (tvSdkRequested || window.Spotify) return;
  tvSdkRequested = true;
  const script = document.createElement('script');
  script.src = 'https://sdk.scdn.co/spotify-player.js';
  document.head.appendChild(script);
}
async function startTvPairing() {
  const generation = ++tvPairGeneration;
  tvPairInProgress = true;
  const panel = document.getElementById('tvSpotifyPair');
  const status = document.getElementById('tvPairStatus');
  const code = document.getElementById('tvPairCode');
  const retry = document.getElementById('tvPairRetry');
  panel.hidden = false;
  retry.hidden = true;
  code.textContent = '';
  status.textContent = 'Preparando el código para tu celular...';
  try {
    const response = await fetch('/api/tv-pair/create', { method: 'POST' });
    if (!response.ok) throw new Error('No se pudo crear el código.');
    const pair = await response.json();
    if (generation !== tvPairGeneration) return;
    document.getElementById('tvPairQr').src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=' + encodeURIComponent(location.origin + '/spotify-pair.html');
    code.textContent = pair.code.slice(0, 4) + ' ' + pair.code.slice(4);
    status.textContent = 'Escanea el QR e introduce este código en tu celular. Vence en 5 minutos.';
    const expires = Date.now() + pair.expiresIn;
    while (generation === tvPairGeneration && Date.now() < expires) {
      await new Promise(resolve => setTimeout(resolve, 2500));
      if (generation !== tvPairGeneration) return;
      try {
        const poll = await fetch('/api/tv-pair/poll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({code: pair.code, secret: pair.secret}) });
        if (poll.status === 404) break;
        if (!poll.ok) continue;
        const result = await poll.json();
        if (result.token) {
          saveToken(result.token);
          hideTvPairing();
          setStatus('Spotify conectado. Cargando playlists...');
          loadUserPlaylists().catch(error => setStatus(error.message));
          return;
        }
      } catch (_) { /* Se vuelve a intentar hasta que el código venza. */ }
    }
    if (generation === tvPairGeneration) throw new Error('El código venció.');
  } catch (error) {
    if (generation === tvPairGeneration) {
      tvPairInProgress = false;
      code.textContent = '';
      status.textContent = (error.message || 'No se pudo conectar.') + ' Selecciona Reintentar.';
      retry.hidden = false;
    }
  }
}
document.getElementById('tvPairRetry').addEventListener('click', startTvPairing);
