(function () {
  const clientId = '8791a946e68c476cac41c3d5023a86a7';
  const scopes = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative';
  const key = 'enunanota_tv_pair';
  const form = document.getElementById('form');
  const status = document.getElementById('status');
  const params = new URLSearchParams(location.search);
  const returnUri = location.origin + '/tv/';
  function randomString() { const data = new Uint8Array(48); crypto.getRandomValues(data); return Array.from(data, b => b.toString(16).padStart(2, '0')).join(''); }
  function base64url(bytes) { let s = ''; new Uint8Array(bytes).forEach(b => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''); }
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    const code = document.getElementById('code').value.trim();
    if (!/^\d{8}$/.test(code)) return;
    try {
      const verifier = randomString();
      const state = 'tvpair-' + randomString();
      sessionStorage.setItem(key, JSON.stringify({ code, verifier, state, createdAt: Date.now() }));
      const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
      const auth = new URL('https://accounts.spotify.com/authorize');
      Object.entries({response_type:'code', client_id:clientId, scope:scopes, code_challenge_method:'S256', code_challenge:challenge, redirect_uri:returnUri, state:state}).forEach(([k,v]) => auth.searchParams.set(k,v));
      location.assign(auth.href);
    } catch (_) { status.textContent = 'No se pudo iniciar la conexión. Abre esta página en el navegador de tu celular e intenta otra vez.'; }
  });
  if (params.has('code') || params.has('error')) {
    const pending = JSON.parse(sessionStorage.getItem(key) || 'null');
    const authCode = params.get('code');
    const returnedState = params.get('state');
    history.replaceState({}, '', location.pathname);
    if (!pending || !returnedState || pending.state !== returnedState || Date.now() - pending.createdAt > 300000) { status.textContent = 'La conexión venció o no coincide. Vuelve a empezar.'; return; }
    if (!authCode) { sessionStorage.removeItem(key); status.textContent = 'No se autorizó Spotify. Puedes intentarlo otra vez.'; return; }
    form.hidden = true;
    status.textContent = 'Conectando tu cuenta con la TV...';
    (async function () {
      const response = await fetch('/api/spotify-token', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({grant_type:'authorization_code', code:authCode, redirect_uri:returnUri, client_id:clientId, code_verifier:pending.verifier})});
      const token = await response.json();
      if (!response.ok || !token.access_token || !token.refresh_token) throw new Error(token.error_description || 'Spotify no completó la autorización.');
      const completed = await fetch('/api/tv-pair/complete', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({code:pending.code, token:token})});
      const result = await completed.json();
      if (!completed.ok) throw new Error(result.error || 'No se pudo conectar la TV.');
      sessionStorage.removeItem(key);
      status.textContent = '¡Spotify conectado! Ya puedes volver a la TV.';
    })().catch(function (error) { sessionStorage.removeItem(key); form.hidden = false; status.textContent = error.message || 'No se pudo conectar. Intenta otra vez.'; });
  }
})();
