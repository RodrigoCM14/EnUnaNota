// Compila una vista de prueba para el motor web de Samsung Tizen 5.0.
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const outDir = path.join(publicDir, "tv");
fs.mkdirSync(outDir, { recursive: true });

let source = fs.readFileSync(path.join(publicDir, "host.js"), "utf8");
const redirect = 'if (redirectLocalhostToLoopback()) await new Promise(() => {});';
if (!source.includes(redirect)) throw new Error("No se encontró el inicio esperado del anfitrión; revise la compilación para TV.");
// La navegación a 127.0.0.1 ya abandona la página; no hace falta await de nivel superior.
source = source.replace(redirect, "redirectLocalhostToLoopback();");
source = source.replace("async function connectSpotify() {", "async function connectSpotify() { return startTvPairing();");
const pairSource = fs.readFileSync(path.join(root, "tv", "pair-tv.js"), "utf8");
source = source.replace("function showWelcome() {", pairSource + "\nfunction showWelcome() { showTvPairing(); return;");
source = source.replace("function hideWelcome() {", "function hideWelcome() { hideTvPairing(); return;");
source = source.replace("async function initPlayer(activate = false) {", "async function initPlayer(activate = false) { loadTvSpotifySdk();");
source = source.replace('      activateScreenPlayer().catch(() => setStatus("host.status.reactivatePlayer"));', '      // En TV no iniciar el SDK hasta que el usuario solicite reproducción.');
source = source.replace('"./cover-placeholder.svg"', '"/cover-placeholder.svg"');

async function build() {
  await esbuild.build({
    stdin: { contents: source, resolveDir: publicDir, sourcefile: "host.js", loader: "js" },
    bundle: true,
    format: "iife",
    target: ["chrome63"],
    outfile: path.join(outDir, "host-tv.js"),
    logLevel: "info"
  });
  let html = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
  html = html.replace(/(href|src)="\.\//g, '$1="/');
  const originalScript = '<script src="/host.js" type="module"></script>';
  if (!html.includes(originalScript)) throw new Error("No se encontró el script esperado del anfitrión.");
  html = html.replace(/<section id="welcomeScreen"[\s\S]*?<\/section>/, '');
  html = html.replace('<main class="shell">', `<main class="shell">
      <section id="tvSpotifyPair" class="tv-pair" hidden aria-labelledby="tvPairTitle">
        <div><h1 id="tvPairTitle">Conecta Spotify</h1><p id="tvPairStatus" role="status">Preparando el código para tu celular...</p><strong id="tvPairCode"></strong><p>También puedes abrir <b>enunanota-tv.onrender.com/spotify-pair.html</b> en tu celular.</p><button id="tvPairRetry" class="primary" type="button" hidden>Reintentar</button></div>
        <img id="tvPairQr" width="180" height="180" alt="Código QR para conectar Spotify">
      </section>`);
  html = html.replace('<script src="https://sdk.scdn.co/spotify-player.js"></script>', '');
  html = html.replace('</head>', '  <link rel="stylesheet" href="/tv/tv.css">\n  </head>');
  html = html.replace(originalScript, '<script src="/tv/compat.js"></script>\n    <script src="/tv/host-tv.js"></script>\n    <script src="/tv/remote.js"></script>');
  fs.writeFileSync(path.join(outDir, "index.html"), html);
  for (const file of ["compat.js", "remote.js", "tv.css"]) fs.copyFileSync(path.join(root, "tv", file), path.join(outDir, file));
}
build().catch(error => { console.error(error); process.exitCode = 1; });
