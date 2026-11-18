// Vinculación desde otro dispositivo; el secreto de lectura permanece en la TV.
let tvPairGeneration = 0;
async function startTvPairing() {
  const generation = ++tvPairGeneration;
  const button = elements.welcomeConnect;
  setStatus('Preparando conexión con el celular...');
  const response = await fetch('/api/tv-pair/create', { method: 'POST' });
  if (!response.ok) throw new Error('No se pudo crear el código. Intenta de nuevo.');
  const pair = await response.json();
  if (generation !== tvPairGeneration) return;
  let box = document.querySelector('#tvSpotifyPair');
  if (!box) {
    box = document.createElement('div');
    box.id = 'tvSpotifyPair';
    elements.welcomeStatus.parentNode.insertBefore(box, elements.welcomeStatus);
  }
  const url = location.origin + '/spotify-pair.html';
  box.innerHTML = '<p>Escanea con tu celular y escribe este código:</p><img alt="QR para conectar Spotify" width="170" height="170"><strong></strong><p>El código vence en 5 minutos.</p>';
  box.querySelector('img').src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=' + encodeURIComponent(url);
  box.querySelector('strong').textContent = pair.code.slice(0, 4) + ' ' + pair.code.slice(4);
  button.textContent = 'Generar otro código';
  setStatus('Esperando conexión desde el celular...');
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
        box.remove();
        button.textContent = 'Conectar Spotify';
        hideWelcome();
        setStatus('Spotify conectado. Cargando playlists...');
        loadUserPlaylists().catch(error => setStatus(error.message));
        activateScreenPlayer().catch(() => setStatus('Spotify conectado. La reproducción en esta TV aún debe probarse.'));
        return;
      }
    } catch (_) { /* reintentar mientras el código siga vigente */ }
  }
  if (generation === tvPairGeneration) setStatus('El código venció. Selecciona Generar otro código.');
}
