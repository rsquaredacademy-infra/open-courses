/* Theme toggle, mobile nav and course filter/search.
   The pre-paint theme resolver lives inline in <head> (tokens.css expects
   data-theme on <html>); this file only handles user interaction. */
(function () {
  "use strict";

  /* ---- Theme toggle ---- */
  var root = document.documentElement;
  var KEY = "theme";
  var VALID = ["light", "dark"];

  function stored() {
    try {
      var v = window.localStorage.getItem(KEY);
      return VALID.indexOf(v) !== -1 ? v : null;
    } catch (e) {
      return null;
    }
  }

  function persist(v) {
    try { window.localStorage.setItem(KEY, v); } catch (e) { /* non-fatal */ }
  }

  document.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest && e.target.closest(".theme-toggle");
    if (!btn) return;
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    root.style.colorScheme = next;
    persist(next);
  });

  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var onChange = function () {
      if (stored()) return;
      var next = mq.matches ? "dark" : "light";
      root.setAttribute("data-theme", next);
      root.style.colorScheme = next;
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  /* ---- Mobile nav ---- */
  var navToggle = document.querySelector(".nav-toggle");
  var mainNav = document.querySelector(".main-nav");
  if (navToggle && mainNav) {
    navToggle.addEventListener("click", function () {
      var open = mainNav.classList.toggle("show");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  /* ---- Filter + search ---- */
  var chips = Array.prototype.slice.call(document.querySelectorAll(".chip[data-filter]"));
  var cards = Array.prototype.slice.call(document.querySelectorAll(".course-card"));
  var input = document.querySelector("#course-search");
  var live = document.querySelector("#filter-status");
  var empty = document.querySelector("#no-results");

  if (!cards.length) return;

  var state = { track: "all", query: "" };

  function cardText(card) {
    return (card.getAttribute("data-search") || card.textContent || "").toLowerCase();
  }

  function apply() {
    var shown = 0;
    cards.forEach(function (card) {
      var trackOk = state.track === "all" || card.getAttribute("data-track") === state.track;
      var queryOk = !state.query || cardText(card).indexOf(state.query) !== -1;
      var visible = trackOk && queryOk;
      card.hidden = !visible;
      if (visible) shown++;
    });
    if (live) {
      live.textContent = shown === cards.length
        ? "Showing all " + cards.length + " courses"
        : "Showing " + shown + " of " + cards.length + " courses";
    }
    if (empty) empty.hidden = shown !== 0;
  }

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      chips.forEach(function (c) { c.setAttribute("aria-pressed", String(c === chip)); });
      state.track = chip.getAttribute("data-filter");
      apply();
    });
  });

  if (input) {
    input.addEventListener("input", function () {
      state.query = input.value.trim().toLowerCase();
      apply();
    });
  }

  apply();
})();
