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
source += "\n" + fs.readFileSync(path.join(root, "tv", "pair-tv.js"), "utf8");
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
  html = html.replace('</head>', '  <link rel="stylesheet" href="/tv/tv.css">\n  </head>');
  html = html.replace(originalScript, '<script src="/tv/compat.js"></script>\n    <script src="/tv/host-tv.js"></script>\n    <script src="/tv/remote.js"></script>');
  fs.writeFileSync(path.join(outDir, "index.html"), html);
  for (const file of ["compat.js", "remote.js", "tv.css"]) fs.copyFileSync(path.join(root, "tv", file), path.join(outDir, file));
}
build().catch(error => { console.error(error); process.exitCode = 1; });
