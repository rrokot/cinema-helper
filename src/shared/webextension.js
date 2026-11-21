(() => {
  const api = globalThis.browser ?? globalThis.chrome;

  globalThis.CinemaPlatform = {
    cacheStorage: api.storage.local,
    requestKinogo: (message) => api.runtime.sendMessage(message),
    settingsStorage: {
      get: (defaults) => api.storage.sync.get(defaults),
      set: (patch) => api.storage.sync.set(patch),
      subscribe(keys, callback) {
        api.storage.onChanged.addListener((changes, area) => {
          if (area === "sync" && keys.some((key) => key in changes)) callback();
        });
      },
    },
  };
})();
