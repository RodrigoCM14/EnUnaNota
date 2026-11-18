/* Navegación espacial para las flechas, Enter y Atrás del control Samsung. */
(function () {
  function visible(element) {
    return !element.disabled && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
  }
  function activeArea() {
    var ids = ["rulesModal", "playlistModal", "winnerModal", "welcomeScreen"];
    for (var i = 0; i < ids.length; i += 1) {
      var modal = document.getElementById(ids[i]);
      if (modal && visible(modal)) return modal;
    }
    return document.querySelector(".shell");
  }
  function candidates(area) {
    return Array.prototype.filter.call(area.querySelectorAll("button:not([disabled]),a[href],input:not([type=hidden]):not([disabled]),select:not([disabled])"), visible);
  }
  function navigate(dx, dy) {
    var area = activeArea();
    if (!area) return;
    var options = candidates(area);
    if (!options.length) return;
    var current = document.activeElement;
    if (options.indexOf(current) < 0) { options[0].focus(); return; }
    var r = current.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    var next = null, best = Infinity;
    options.forEach(function (item) {
      if (item === current) return;
      var rect = item.getBoundingClientRect();
      var offsetX = rect.left + rect.width / 2 - x;
      var offsetY = rect.top + rect.height / 2 - y;
      var forward = dx ? offsetX * dx : offsetY * dy;
      if (forward <= 0) return;
      var sideways = dx ? Math.abs(offsetY) : Math.abs(offsetX);
      var score = forward + sideways * 2.5;
      if (score < best) { best = score; next = item; }
    });
    if (next) next.focus();
  }
  document.addEventListener("keydown", function (event) {
    var code = event.keyCode;
    if (code === 10009 || code === 27) {
      var area = activeArea();
      var close = area && area.querySelector("#closeRulesModal, #closePlaylists, #closeWinnerModal");
      if (close) { event.preventDefault(); close.click(); }
      return;
    }
    var active = document.activeElement;
    if (active && /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName)) return;
    var directions = {37: [-1, 0], 38: [0, -1], 39: [1, 0], 40: [0, 1]};
    if (directions[code]) { event.preventDefault(); navigate(directions[code][0], directions[code][1]); }
  });
}());
