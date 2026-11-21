(() => {
  const { requestUrl, MAX_RESPONSE_LENGTH, REQUEST_TIMEOUT_MS } = globalThis.CinemaKinogo;

  async function requestKinogo(message) {
    const url = requestUrl(message);
    if (!url) throw new Error("Недопустимый адрес Kinogo");

    const request = GM.xmlHttpRequest({ method: "GET", url: url.href, anonymous: true });
    const timeout = setTimeout(() => request.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await request;
      if (new URL(response.finalUrl).origin !== url.origin) throw new Error("Неожиданный адрес ответа Kinogo");
      if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
      const html = response.responseText;
      if (html.length > MAX_RESPONSE_LENGTH) throw new Error("Слишком большой ответ от Kinogo");
      return { html };
    } finally {
      clearTimeout(timeout);
    }
  }

  globalThis.CinemaPlatform = {
    requestKinogo,
    cacheStorage: {
      async get(key) {
        const keys = key === null ? await GM.listValues() : [key];
        return GM.getValues(keys);
      },
      set: (values) => GM.setValues(values),
      remove: (keys) => GM.deleteValues(keys),
    },
    settingsStorage: {
      get: (defaults) => GM.getValues(defaults),
      set: (patch) => GM.setValues(patch),
      subscribe(keys, callback) {
        for (const key of keys) GM.addValueChangeListener(key, callback);
      },
    },
  };

  GM_registerMenuCommand("Включить или выключить Cinema Helper", async () => {
    const { load, save } = globalThis.CinemaSettings;
    const { enabled } = await load();
    await save({ enabled: !enabled });
    location.reload();
  });

  GM_registerMenuCommand("Переключить скрытие рекламы", async () => {
    const { load, save } = globalThis.CinemaSettings;
    const { features } = await load();
    await save({ features: { ...features, cleanUi: !features.cleanUi } });
  });
})();
