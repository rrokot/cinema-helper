(() => {
  const { settingsStorage } = globalThis.CinemaPlatform;

  const DEFAULTS = {
    enabled: true,
    features: {
      cleanUi: true,
    },
  };

  async function load() {
    const stored = await settingsStorage.get(DEFAULTS);
    return {
      ...DEFAULTS,
      ...stored,
      features: { ...DEFAULTS.features, ...stored.features },
    };
  }

  function save(patch) {
    return settingsStorage.set(patch);
  }

  function onChange(callback) {
    settingsStorage.subscribe(Object.keys(DEFAULTS), () => load().then(callback));
  }

  globalThis.CinemaSettings = { DEFAULTS, load, save, onChange };
})();
