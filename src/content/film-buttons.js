(() => {
  const { cacheStorage, requestKinogo } = globalThis.CinemaPlatform;
  const { PRIMARY_ORIGIN, FALLBACK_ORIGIN, FILM_PATH, MAX_SEARCH_PAGE, allowedUrl } = globalThis.CinemaKinogo;
  const YEAR_IN_FILM_URL = /-(\d{4})(?:\.html|\/|$)/;
  const MAX_CANDIDATES_FOR_DETAIL_CHECK = 5;

  function normalizeTitle(title) {
    return title
      .toLocaleLowerCase("ru")
      .replace(/ё/g, "е")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function splitTitleYear(text) {
    const trailingParenthesesWithYear = text.match(/\s*\(([^()]*\d{4}[^()]*)\)\s*$/);
    return {
      title: text.slice(0, trailingParenthesesWithYear?.index).trim(),
      year: trailingParenthesesWithYear?.[1].match(/\d{4}/)[0],
    };
  }

  function parseKinogoLinkTitle(linkText) {
    const titleWithoutWatchOnlineSuffix = linkText.replace(/\s+смотреть\s+онлайн(?:\s[\s\S]*)?$/iu, "");
    const titleWithoutSeason = titleWithoutWatchOnlineSuffix.replace(
      /\s*\(\d+(?:\s*[-–]\s*\d+)?\s+сезон(?:а|ов)?\)\s*$/iu, "",
    );
    return splitTitleYear(titleWithoutSeason);
  }

  function readKinogoFilmYear(filmDocument) {
    const heading = filmDocument.querySelector("h1")?.textContent ?? "";
    const pageTitle = filmDocument.querySelector("title")?.textContent ?? "";
    return heading.match(/\((\d{4})\)/)?.[1] ??
      pageTitle.match(/\((\d{4})\)/)?.[1] ??
      filmDocument.body?.textContent.match(/Год(?:\s+(?:выпуска|выхода|производства))?\s*:\s*(\d{4})/iu)?.[1];
  }

  function readKinogoOriginalTitle(filmDocument) {
    const originalTitleLabel = /^\s*Оригинальное название\s*:\s*/iu;
    return [...filmDocument.querySelectorAll(".sd-line")]
      .find((line) => originalTitleLabel.test(line.textContent))
      ?.textContent.replace(originalTitleLabel, "").trim();
  }

  function rutrackerSearchUrl(title, year) {
    const url = new URL("https://rutracker.org/forum/tracker.php");
    url.searchParams.set("nm", year ? `${title} ${year}` : title);
    return url.href;
  }

  function kinogoSearchUrl(title) {
    return `${PRIMARY_ORIGIN}/search/${encodeURIComponent(title.trim())}`;
  }

  function searchPageNumber(href, title, onclick, origin = PRIMARY_ORIGIN) {
    try {
      let pageNumber;
      if (href === "#") {
        const listSubmitCall = /^(?:javascript:)?\s*list_submit\((\d+)\);?\s*(?:return\(false\);?)?\s*$/;
        pageNumber = onclick?.match(listSubmitCall)?.[1];
      } else {
        const url = new URL(href, origin);
        if (url.origin !== origin) return null;
        const searchTitle = title.trim();
        if (url.searchParams.get("do") === "search" && url.searchParams.get("story") === searchTitle) {
          pageNumber = url.searchParams.get("search_start");
        } else {
          const segments = decodeURIComponent(url.pathname).replace(/\/$/, "").split("/");
          if (segments.length !== 5 || segments[1] !== "search" ||
              segments[2] !== searchTitle || segments[3] !== "page") return null;
          pageNumber = segments[4];
        }
      }
      const page = Number(pageNumber);
      return Number.isInteger(page) && page > 1 && page <= MAX_SEARCH_PAGE ? page : null;
    } catch {
      return null;
    }
  }

  const KINOGO_BUTTON_COPY = {
    loading: { label: "Kinogo", hint: "Проверяем, есть ли фильм на Kinogo…" },
    found: { label: "Kinogo", hint: "Смотреть на Kinogo" },
    "not-found": { label: "Искать на Kinogo", hint: "Точное совпадение не определено — открыть поиск Kinogo" },
    unavailable: { label: "Kinogo: ошибка", hint: "Не удалось проверить — открыть поиск Kinogo" },
  };

  function renderKinogoButton(button, { status, href, releaseYear }, film) {
    button.dataset.status = status;
    if (status === "related") {
      button.textContent = `Kinogo: ${releaseYear}`;
      button.title = `Одноимённый сериал «${film.originalTitle}» с ${releaseYear} года; на этой странице указан ${film.year} год`;
    } else {
      const { label, hint } = KINOGO_BUTTON_COPY[status];
      button.textContent = label;
      button.title = hint;
    }
    if (href) button.href = href;
  }

  const CACHE_PREFIX = "kinogoLink:";
  const CACHE_VERSION = 2;
  const CACHE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

  function isKinogoCacheEntryExpired(entry, now) {
    return now - entry.savedAt > CACHE_TTL_MS;
  }

  async function readCachedKinogoLink(kinopoiskId, title, year) {
    const cacheKey = CACHE_PREFIX + kinopoiskId;
    const { [cacheKey]: entry } = await cacheStorage.get(cacheKey);
    if (!entry || entry.version !== CACHE_VERSION || entry.title !== title ||
        entry.year !== year || isKinogoCacheEntryExpired(entry, Date.now())) return null;
    return allowedUrl(entry.href, PRIMARY_ORIGIN)?.href ?? null;
  }

  async function cacheFoundKinogoLink(kinopoiskId, href, title, year) {
    const storedEntries = await cacheStorage.get(null);
    const now = Date.now();
    const expiredCacheKeys = Object.keys(storedEntries).filter(
      (key) => key.startsWith(CACHE_PREFIX) && isKinogoCacheEntryExpired(storedEntries[key], now),
    );
    if (expiredCacheKeys.length) await cacheStorage.remove(expiredCacheKeys);
    await cacheStorage.set({
      [CACHE_PREFIX + kinopoiskId]: { href, savedAt: now, version: CACHE_VERSION, title, year },
    });
  }

  async function findExactKinogoFilmUrls(resultContainer, { title, year, kind, originalTitle }, origin, relatedSeries) {
    const exactUrls = [];
    const seenMatchingTitleUrls = new Set();
    const normalizedTitle = normalizeTitle(title);
    const canSuggestRelatedSeries = kind === "series" && originalTitle;
    const expectedYear = String(year);

    for (const link of resultContainer?.querySelectorAll("a") ?? []) {
      const linkText = link.textContent.trim();
      if (!linkText) continue;
      const url = allowedUrl(link.getAttribute("href"), origin);
      if (!url || !FILM_PATH.test(url.pathname) || seenMatchingTitleUrls.has(url.href)) continue;

      const linkTitle = parseKinogoLinkTitle(linkText);
      if (normalizeTitle(linkTitle.title) !== normalizedTitle) continue;
      seenMatchingTitleUrls.add(url.href);

      const yearInUrl = url.href.match(YEAR_IN_FILM_URL)?.[1];
      if (!year || (linkTitle.year ?? yearInUrl) === expectedYear) {
        exactUrls.push(url.href);
        continue;
      }

      const hasYearInSearchResult = splitTitleYear(linkText).year || yearInUrl;
      if ((!canSuggestRelatedSeries && hasYearInSearchResult) ||
          seenMatchingTitleUrls.size > MAX_CANDIDATES_FOR_DETAIL_CHECK) continue;

      const response = await requestKinogo({ type: "check-kinogo-page", href: url.href });
      if (!response || response.error) throw new Error(response?.error ?? "Не удалось проверить год фильма");
      const filmDocument = new DOMParser().parseFromString(response.html, "text/html");
      const releaseYear = readKinogoFilmYear(filmDocument);
      if (releaseYear === expectedYear) {
        exactUrls.push(url.href);
      } else if (canSuggestRelatedSeries && releaseYear) {
        const candidateOriginalTitle = readKinogoOriginalTitle(filmDocument);
        if (candidateOriginalTitle && normalizeTitle(candidateOriginalTitle) === normalizeTitle(originalTitle)) {
          relatedSeries.set(url.href, { href: url.href, releaseYear });
        }
      }
    }
    return exactUrls;
  }

  async function searchKinogoSource(film, origin) {
    const pendingPages = [1];
    const visitedPages = new Set();
    const relatedSeries = new Map();

    while (pendingPages.length) {
      const page = pendingPages.shift();
      visitedPages.add(page);
      const response = await requestKinogo({ type: "check-kinogo-title", title: film.title, page, origin });
      if (!response || response.error) {
        throw new Error(response?.error ?? "Пустой ответ от фонового процесса");
      }

      const searchDocument = new DOMParser().parseFromString(response.html, "text/html");
      const resultContainer = searchDocument.querySelector("#dle-content, .search-results, .search-result");
      const exactUrls = await findExactKinogoFilmUrls(resultContainer, film, origin, relatedSeries);
      if (exactUrls.length === 1) return { status: "found", href: exactUrls[0] };

      if (resultContainer) {
        for (const link of searchDocument.querySelectorAll("a[href]")) {
          const nextPage = searchPageNumber(link.getAttribute("href"), film.title, link.getAttribute("onclick"), origin);
          if (nextPage && !visitedPages.has(nextPage) && !pendingPages.includes(nextPage)) {
            pendingPages.push(nextPage);
          }
        }
        if (pendingPages.length) {
          pendingPages.sort((first, second) => first - second);
          continue;
        }
      }

      if (relatedSeries.size === 1 && exactUrls.length === 0) {
        return { status: "related", ...relatedSeries.values().next().value };
      }
      const hasNoResultsMessage = /ничего не найдено|нет результатов|no results/i.test(
        searchDocument.body?.textContent ?? "",
      );
      if (resultContainer || hasNoResultsMessage) return { status: "not-found" };
      return { status: "unavailable" };
    }
  }

  async function updateKinogoButtonFromSource(log, film, button, origin = PRIMARY_ORIGIN) {
    const { kinopoiskId, title, year } = film;
    if (kinopoiskId) {
      try {
        const href = await readCachedKinogoLink(kinopoiskId, title, year);
        if (href) {
          const cachedResult = { status: "found", href };
          renderKinogoButton(button, cachedResult, film);
          return cachedResult;
        }
      } catch (error) {
        log("Не удалось прочитать кэш ссылок Kinogo", error);
      }
    }

    renderKinogoButton(button, { status: "loading" }, film);
    let result;
    try {
      result = await searchKinogoSource(film, origin);
      if (result.status === "unavailable") log("Не удалось распознать результаты поиска Kinogo");
    } catch (error) {
      result = { status: "unavailable" };
      log("Ошибка проверки Kinogo", error);
    }

    renderKinogoButton(button, result, film);
    if (result.status === "found" && kinopoiskId) {
      cacheFoundKinogoLink(kinopoiskId, result.href, title, year).catch((error) =>
        log("Не удалось сохранить ссылку Kinogo в кэш", error),
      );
    }
    return result;
  }

  async function checkKinogo(log, film, button) {
    const primaryResult = await updateKinogoButtonFromSource(log, film, button);
    if (primaryResult.status === "found") return;
    const fallbackResult = await updateKinogoButtonFromSource(log, film, button, FALLBACK_ORIGIN);
    if (fallbackResult.status === "found") return;
    if (primaryResult.status === "related" || fallbackResult.status === "unavailable") {
      renderKinogoButton(button, primaryResult, film);
    }
  }

  function createButton(siteId, buttonClass, href) {
    const button = document.createElement("a");
    button.className = `cinema-btn ${buttonClass}`;
    button.dataset.site = siteId;
    button.href = href;
    button.target = "_blank";
    button.rel = "noopener noreferrer";
    return button;
  }

  function placeInOrder(elements, { appendTo, insertAfter }) {
    let previous = insertAfter;
    for (const element of elements) {
      if (previous) {
        if (element.previousElementSibling !== previous) previous.after(element);
      } else if (element.parentElement !== appendTo) {
        appendTo.append(element);
      }
      previous = element;
    }
  }

  function mount({ site, log }, { readFilmPage, placeFilmButtons }) {
    let mountedPage = null;

    function updateFilmButtons() {
      const film = readFilmPage();

      if (mountedPage && mountedPage.pageKey !== film?.pageKey) {
        mountedPage.buttons.forEach((button) => button.remove());
        mountedPage = null;
      }
      if (!film?.title) return;
      if (mountedPage) {
        placeFilmButtons(mountedPage.buttons);
        return;
      }

      const kinogo = createButton(site.id, "cinema-btn--kinogo", kinogoSearchUrl(film.title));
      kinogo.setAttribute("aria-live", "polite");
      renderKinogoButton(kinogo, { status: "loading" }, film);

      const rutracker = createButton(site.id, "cinema-btn--rutracker", rutrackerSearchUrl(film.title, film.year));
      rutracker.textContent = "Rutracker";
      rutracker.title = "Искать раздачи на Rutracker";

      mountedPage = { pageKey: film.pageKey, buttons: [kinogo, rutracker] };
      placeFilmButtons(mountedPage.buttons);
      checkKinogo(log, film, kinogo);
    }

    updateFilmButtons();
    new MutationObserver(updateFilmButtons).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  globalThis.CinemaFilmButtons = { mount, placeInOrder, splitTitleYear };
})();
