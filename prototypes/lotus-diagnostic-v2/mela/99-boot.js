renderMap();
Rangoli.render($("#rgMini"), false);
(function boot() {
  const id = (location.hash || "").slice(1);
  if (id && GAMES[id]) openStall(id);
})();
