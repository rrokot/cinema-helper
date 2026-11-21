(() => {
  const PRIMARY_ORIGIN = "https://kinogo.media";
  const FALLBACK_ORIGIN = "https://kinogo.online";
  const ORIGINS = [PRIMARY_ORIGIN, FALLBACK_ORIGIN];
  const FILM_PATH = /\/\d+[^/]*\.html$/;
  const MAX_SEARCH_PAGE = 10;
  const MAX_SEARCH_TITLE_LENGTH = 200;
  const MAX_RESPONSE_LENGTH = 2_000_000;
  const REQUEST_TIMEOUT_MS = 12_000;

  function allowedUrl(href, base) {
    if (!href) return null;
    try {
      const url = new URL(href, base);
      if (url.protocol !== "https:" || !ORIGINS.includes(url.origin) || url.username || url.password) return null;
      return url;
    } catch {
      return null;
    }
  }

  function requestUrl({ type, title, page, href, origin }) {
    origin ??= PRIMARY_ORIGIN;
    if (!ORIGINS.includes(origin)) return null;
    if (type === "check-kinogo-page") {
      const filmUrl = allowedUrl(href);
      if (!filmUrl || !FILM_PATH.test(filmUrl.pathname)) return null;
      filmUrl.search = "";
      filmUrl.hash = "";
      return filmUrl;
    }
    if (type !== "check-kinogo-title") return null;

    page ??= 1;
    if (typeof title !== "string" || !title.trim() || title.length > MAX_SEARCH_TITLE_LENGTH) return null;
    if (!Number.isInteger(page) || page < 1 || page > MAX_SEARCH_PAGE) return null;
    const url = new URL(origin);
    url.pathname = `/search/${encodeURIComponent(title.trim())}` + (page > 1 ? `/page/${page}` : "");
    return url;
  }

  globalThis.CinemaKinogo = {
    PRIMARY_ORIGIN,
    FALLBACK_ORIGIN,
    FILM_PATH,
    MAX_SEARCH_PAGE,
    MAX_RESPONSE_LENGTH,
    REQUEST_TIMEOUT_MS,
    allowedUrl,
    requestUrl,
  };
})();
