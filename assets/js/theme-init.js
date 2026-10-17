/* Theme resolver: must run before first paint so a dark-preference
   visitor never sees a white flash. The toggle handler itself lives in
   main.js. Stored values are whitelisted before reaching the attribute. */
(function () {
  var KEY = "theme";
  var VALID = ["light", "dark"];
  function stored() {
    try {
      var v = window.localStorage.getItem(KEY);
      return VALID.indexOf(v) !== -1 ? v : null;
    } catch (e) { return null; }
  }
  var root = document.documentElement;
  var choice = stored();
  if (!choice) {
    choice = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  root.setAttribute("data-theme", choice);
  root.style.colorScheme = choice;
})();
