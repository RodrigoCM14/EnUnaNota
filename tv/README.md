# Prueba para Samsung TV (Tizen 5.0)

Esta rama prepara una versión experimental de la pantalla del anfitrión para la serie Samsung RU7100 de 2019. La aplicación habitual y los teléfonos siguen usando `/` y `/player`; la pantalla experimental se sirve en `/tv/` desde el mismo servidor.

## Estado

- La compilación adapta el JavaScript del anfitrión a Chromium 63 y aplica correcciones puntuales para APIs y CSS más recientes.
- Las flechas mueven el foco entre controles, Enter activa el botón enfocado y Atrás cierra las ventanas abiertas. Los jugadores siguen usando sus teléfonos.
- Es una prueba: no se ha ejecutado en una TV real ni se ha verificado el inicio de sesión o la reproducción de Spotify en Tizen. La presencia de una pantalla no garantiza que el reproductor de Spotify sea compatible.
- Aún no hay un paquete `.wgt` firmado ni una aplicación instalada. La versión del navegador y la aplicación Tizen pueden comportarse de manera diferente; hay que probar ambas antes de darla por compatible.

## Ejecutar localmente

Con Node.js 18 o superior:

```sh
npm install --include=dev
npm run build:tv
npm start
```

Abrir `http://127.0.0.1:3000/tv/`. La carpeta `public/tv/` se genera durante la compilación y no se guarda en Git. Para probar desde otra máquina es necesario un servidor accesible por HTTPS; la autorización de Spotify requiere un origen y un URI de retorno permitidos por Spotify.

## Probar en la TV sin alterar la versión principal

1. Desplegar **esta rama** en un servicio de prueba independiente; no cambiar la rama configurada para el servicio de producción. La configuración de esta rama instala las dependencias de desarrollo y ejecuta `npm run build:tv`.
2. En la aplicación correspondiente de Spotify Developer, añadir el URI de retorno exacto del servicio de prueba: `https://<dominio-de-prueba>/tv/`. Spotify debe aprobar ese URI en la configuración de la aplicación antes de intentar iniciar sesión. No guardar secretos ni tokens en el repositorio.
3. Abrir `https://<dominio-de-prueba>/tv/` en el navegador de la TV. Conectar una cuenta autorizada, comprobar el control remoto, escanear el QR desde un teléfono y probar una ronda y el audio.
4. Si la web y Spotify funcionan, preparar un proyecto Samsung TV en Tizen Studio, crear los certificados para el televisor y probar un paquete `.wgt` firmado. La instalación y el acceso a páginas alojadas externamente requieren validación en el dispositivo; no se asume que un simple contenedor externo funcione igual que el navegador.

La página `/tv/` necesita el mismo servidor Node.js para crear salas y recibir buzzers; no funciona desconectada. La URL de los teléfonos apunta a `/player` en el mismo servicio de prueba.

## Comprobaciones locales

`npm run build:tv` debe terminar sin errores. Se puede abrir la pantalla y probar las flechas del teclado como aproximación inicial al control remoto. Esto no sustituye una prueba en Tizen 5.0 ni una prueba con Spotify real.
