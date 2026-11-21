(async () => {
  const api = globalThis.browser ?? globalThis.chrome;
  const { load, save } = globalThis.CinemaSettings;
  document.getElementById("version").textContent = `Версия ${api.runtime.getManifest().version}`;
  const enabledCheckbox = document.getElementById("enabled");
  const featureSettings = document.getElementById("features");
  const featureCheckboxes = featureSettings.querySelectorAll("[data-feature]");

  let settings = await load();

  function renderSettings() {
    enabledCheckbox.checked = settings.enabled;
    featureSettings.disabled = !settings.enabled;
    for (const checkbox of featureCheckboxes) {
      checkbox.checked = Boolean(settings.features[checkbox.dataset.feature]);
    }
  }

  enabledCheckbox.addEventListener("change", async () => {
    settings.enabled = enabledCheckbox.checked;
    await save({ enabled: settings.enabled });
    renderSettings();
  });

  for (const checkbox of featureCheckboxes) {
    checkbox.addEventListener("change", async () => {
      settings.features = { ...settings.features, [checkbox.dataset.feature]: checkbox.checked };
      await save({ features: settings.features });
    });
  }

  renderSettings();
})();
