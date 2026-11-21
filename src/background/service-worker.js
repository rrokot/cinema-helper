const isServiceWorker = typeof importScripts === "function";
if (isServiceWorker) importScripts("dev-reload.js", "../shared/kinogo.js");

const api = globalThis.browser ?? globalThis.chrome;
const { requestUrl, MAX_RESPONSE_LENGTH, REQUEST_TIMEOUT_MS } = globalThis.CinemaKinogo;

const ALLOWED_SENDER_HOSTS = ["kinopoisk.ru", "myshows.me"];

api.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") {
    console.log("Cinema Helper installed");
  }
});

function isAllowedSender(sender) {
  try {
    const senderHost = new URL(sender.url ?? sender.tab?.url).hostname;
    return ALLOWED_SENDER_HOSTS.some(
      (host) => senderHost === host || senderHost.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

async function saveLastKinogoResponse(requestUrl, response, html, messageType) {
  const key = messageType === "check-kinogo-title" ? "kinogoDebug:search" : "kinogoDebug:film";
  try {
    await api.storage.local.set({
      [key]: {
        requestedUrl: requestUrl.href,
        finalUrl: response.url,
        status: response.status,
        capturedAt: Date.now(),
        html,
      },
    });
  } catch (error) {
    console.warn("[cinema-helper] Не удалось сохранить диагностику Kinogo", error);
  }
}

async function fetchKinogoHtml(requestUrl, messageType) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(requestUrl, { credentials: "omit", signal: controller.signal });
    if (new URL(response.url).origin !== requestUrl.origin) throw new Error("Неожиданный адрес ответа Kinogo");
    const html = await response.text();
    if (html.length <= MAX_RESPONSE_LENGTH) await saveLastKinogoResponse(requestUrl, response, html, messageType);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (html.length > MAX_RESPONSE_LENGTH) throw new Error("Слишком большой ответ от Kinogo");
    return html;
  } finally {
    clearTimeout(timeout);
  }
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !isAllowedSender(sender)) return false;
  const url = requestUrl(message);
  if (!url) return false;

  fetchKinogoHtml(url, message.type)
    .then((html) => sendResponse({ html }))
    .catch((error) => sendResponse({ error: error.message }));
  return true;
});
