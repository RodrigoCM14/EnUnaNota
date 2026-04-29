# En Una Nota

Juego de fiesta en HTML/JS con Spotify Premium y buzzers desde telefonos.

## Ejecutar localmente

```powershell
& 'C:\Users\rcarr\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' server.js
```

Luego abre:

- Anfitrion: `http://127.0.0.1:3000`
- Jugadores: el enlace que aparece en la pantalla del anfitrion, por ejemplo `http://192.168.1.44:3000/player?room=default`

Todos los telefonos deben estar en la misma red Wi-Fi que la computadora anfitriona.

## Spotify local

En la configuracion de Spotify agrega este redirect URI:

```text
http://127.0.0.1:3000/
```

Spotify no acepta `localhost` como redirect URI. Usa `127.0.0.1`, que es la direccion local segura permitida para desarrollo.

## Subir a GitHub y desplegar

Este juego necesita un servidor para las salas y buzzers en tiempo real, asi que GitHub Pages no alcanza por si solo. El repositorio incluye un `index.html` en la raiz para evitar pantallas `Not Found` en hostings estaticos, pero la version jugable debe correr como servicio Node.

La ruta recomendada es GitHub + Render Web Service.

1. Crea un repositorio en GitHub.
2. Sube estos archivos al repositorio.
3. Entra a Render y crea un **Web Service** nuevo desde ese repositorio. No uses **Static Site**.
4. Render detectara `render.yaml`. Si lo configuras manualmente, usa:
   - Build command: `npm install`
   - Start command: `npm start`
5. Cuando Render te de la URL publica, por ejemplo `https://en-una-nota.onrender.com`, agregala en Spotify como Redirect URI con slash final:

```text
https://TU-APP.onrender.com/
```

6. Abre el juego desde esa URL publica y conecta Spotify.

Despues de autorizar Spotify una vez desde la misma URL, el juego guarda la sesion en ese navegador y renueva la conexion automaticamente.

## Si Spotify vuelve con `?error=server_error`

Revisa este checklist:

- En Spotify Dashboard, la Redirect URI debe ser exactamente la URL publica con slash final, por ejemplo `https://en-una-nota.onrender.com/`.
- Guarda los cambios en Spotify despues de agregar la Redirect URI.
- En Render, el servicio debe ser **Web Service**, no **Static Site**.
- En Render, fuerza un redeploy despues de subir cambios a GitHub.
- Abre el juego desde la misma URL que agregaste a Spotify. No mezcles `http`, `https`, rutas `/public/`, ni dominios distintos.

La cuenta que conecta Spotify debe tener Premium. La app usa el Web Playback SDK para reproducir fragmentos aleatorios y la Web API para leer la playlist.
