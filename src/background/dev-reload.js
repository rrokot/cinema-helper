(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const FILE_POLL_INTERVAL_MS = 1500;
  const FILES_NOT_LISTED_IN_MANIFEST = ["src/popup/popup.js", "src/popup/popup.css"];

  function listWatchedExtensionFiles() {
    const manifest = api.runtime.getManifest();
    const files = new Set(["manifest.json", ...FILES_NOT_LISTED_IN_MANIFEST]);
    const background = manifest.background ?? {};
    if (background.service_worker) files.add(background.service_worker);
    background.scripts?.forEach((file) => files.add(file));
    manifest.content_scripts?.forEach((script) => {
      script.js?.forEach((file) => files.add(file));
      script.css?.forEach((file) => files.add(file));
    });
    if (manifest.action?.default_popup) files.add(manifest.action.default_popup);
    return [...files];
  }

  async function readFileContents(files) {
    const contents = await Promise.all(
      files.map((file) =>
        fetch(api.runtime.getURL(file), { cache: "no-store" })
          .then((response) => response.text())
          .catch(() => ""),
      ),
    );
    return contents.join("\u0000");
  }

  function keepServiceWorkerAwake() {
    return api.runtime.getPlatformInfo();
  }

  async function reloadOnFileChanges() {
    const isFirefox = typeof api.runtime.getBrowserInfo === "function";
    if (!isFirefox) {
      const { installType } = await api.management.getSelf();
      if (installType !== "development") return;
    }

    const files = listWatchedExtensionFiles();
    const initialContents = await readFileContents(files);
    console.log("[cinema-helper] автообновление включено, файлов:", files.length);

    setInterval(async () => {
      await keepServiceWorkerAwake();
      const currentContents = await readFileContents(files);
      if (currentContents !== initialContents) {
        console.log("[cinema-helper] файлы изменились, перезагружаю расширение");
        api.runtime.reload();
      }
    }, FILE_POLL_INTERVAL_MS);
  }

  reloadOnFileChanges().catch((error) => console.warn("[cinema-helper] автообновление не запустилось", error));
})();
