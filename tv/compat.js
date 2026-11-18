/* Compatibilidad limitada con el navegador Chromium 63 de Tizen 5.0. */
(function () {
  if (!String.prototype.replaceAll) {
    String.prototype.replaceAll = function (search, replacement) {
      if (search instanceof RegExp) {
        if (!search.global) throw new TypeError("replaceAll requiere una expresión regular global");
        return String(this).replace(search, replacement);
      }
      return String(this).split(String(search)).join(String(replacement));
    };
  }
  if (!Element.prototype.replaceChildren) {
    Element.prototype.replaceChildren = function () {
      while (this.firstChild) this.removeChild(this.firstChild);
      for (var i = 0; i < arguments.length; i += 1) {
        this.appendChild(typeof arguments[i] === "string" ? document.createTextNode(arguments[i]) : arguments[i]);
      }
    };
  }
}());
