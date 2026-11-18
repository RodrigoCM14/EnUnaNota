(function () {
  // La pantalla, el inicio de sesión y las salas viven en el servicio de prueba.
  var testUrl = "https://enunanota-tv.onrender.com/tv/";
  var button = document.getElementById("openApp");
  function openApp() {
    document.getElementById("status").textContent = "Conectando con En Una Nota…";
    try {
      window.location.replace(testUrl);
    } catch (error) {
      document.getElementById("status").textContent = "No se pudo abrir la página. Revisa la conexión a internet e inténtalo de nuevo.";
      button.focus();
    }
  }
  button.addEventListener("click", openApp);
  button.focus();
  // Si la TV impide la navegación, el botón queda disponible para reintentar.
  window.setTimeout(openApp, 1200);
}());
