// La TV muestra la vinculación dentro de la pantalla principal, sin bloquearla.
let tvPairGeneration = 0;
let tvPairInProgress = false;

function showTvPairing() {
  const panel = document.getElementById('tvSpotifyPair');
  panel.hidden = false;
  document.getElementById('tvDevicePanel').hidden = true;
  if (!tvPairInProgress) startTvPairing();
}
function hideTvPairing() {
  ++tvPairGeneration;
  tvPairInProgress = false;
  document.getElementById('tvSpotifyPair').hidden = true;
  document.getElementById('tvDevicePanel').hidden = false;
  refreshTvDevices();
}
async function refreshTvDevices() {
  const status = document.getElementById('tvDeviceStatus');
  const select = document.getElementById('tvDeviceSelect');
  try {
    const data = await spotify('/me/player/devices');
    const devices = (data && data.devices || []).filter(device => device.id && !device.is_restricted);
    const previous = activePlaybackDeviceId || select.value;
    const chosen = devices.find(device => device.id === previous) || devices.find(device => device.is_active) || devices[0];
    select.replaceChildren();
    if (!chosen) {
      activePlaybackDeviceId = '';
      const empty = document.createElement('option');
      empty.textContent = 'No hay dispositivos disponibles';
      empty.value = '';
      select.appendChild(empty);
      status.textContent = 'Abre Spotify en otro dispositivo con la misma cuenta, reproduce algo y actualiza la lista.';
      setStatus(status.textContent);
      return '';
    }
    devices.forEach(device => {
      const option = document.createElement('option');
      option.value = device.id;
      option.textContent = device.name + (device.is_active ? ' (activo)' : '');
      select.appendChild(option);
    });
    select.value = chosen.id;
    activePlaybackDeviceId = chosen.id;
    status.textContent = 'El audio sonará en ' + chosen.name + '.';
    return chosen.id;
  } catch (error) {
    activePlaybackDeviceId = '';
    status.textContent = 'No se pudieron cargar los dispositivos: ' + (error.message || 'revisa la conexión con Spotify');
    setStatus(status.textContent);
    return '';
  }
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

document.getElementById('tvDeviceRefresh').addEventListener('click', refreshTvDevices);
document.getElementById('tvDeviceSelect').addEventListener('change', function (event) {
  activePlaybackDeviceId = event.target.value;
  const option = event.target.options[event.target.selectedIndex];
  document.getElementById('tvDeviceStatus').textContent = option && option.value ? 'El audio sonará en ' + option.textContent + '.' : 'Selecciona un dispositivo disponible.';
  if (option && option.value) document.getElementById('playRound').focus();
});
