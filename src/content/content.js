(async () => {
  const { load, onChange } = globalThis.CinemaSettings;
  const site = globalThis.CinemaSites.findSite(location.hostname);
  if (!site) return;

  const ROOT_CLASS = "cinema-helper";
  const log = (...args) => console.debug(`[cinema-helper:${site.id}]`, ...args);

  let hiddenElementsStyle = null;

  function applyCleanUi(enabled) {
    if (!enabled || !site.hide?.length) {
      hiddenElementsStyle?.remove();
      hiddenElementsStyle = null;
      return;
    }
    hiddenElementsStyle ??= document.head.appendChild(document.createElement("style"));
    hiddenElementsStyle.textContent = `${site.hide.join(",\n")} { display: none !important; }`;
  }

  function applySettings(settings) {
    document.documentElement.classList.toggle(ROOT_CLASS, settings.enabled);
    applyCleanUi(settings.enabled && settings.features.cleanUi);
  }

  const settings = await load();
  applySettings(settings);
  if (settings.enabled) site.init?.({ site, settings, log });

  onChange(applySettings);
})();
