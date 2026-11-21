(() => {
  const { mount, placeInOrder, splitTitleYear } = globalThis.CinemaFilmButtons;

  const SITES = [
    {
      id: "kinopoisk",
      type: "catalog",
      hosts: ["kinopoisk.ru"],
      init(context) {
        mount(context, {
          readFilmPage() {
            const kinopoiskId = location.pathname.match(/^\/(?:film|series)\/(\d+)/)?.[1];
            if (!kinopoiskId) return null;
            const { title, year } = splitTitleYear(document.querySelector("h1")?.textContent ?? "");
            return { pageKey: kinopoiskId, kinopoiskId, title, year };
          },

          placeFilmButtons(buttons) {
            const watchlistButtonRow = document.querySelector('[class*="styles_buttonsContainer"]');
            const heading = document.querySelector("h1");
            if (!watchlistButtonRow && !heading) return;
            for (const button of buttons) {
              button.dataset.place = watchlistButtonRow ? "buttons" : "title";
            }
            placeInOrder(buttons, watchlistButtonRow ? { appendTo: watchlistButtonRow } : { insertAfter: heading });
          },
        });
      },
    },
    {
      id: "myshows",
      type: "catalog",
      hosts: ["myshows.me"],
      init(context) {
        const filmButtonRow = document.createElement("div");
        filmButtonRow.className = "cinema-myshows-buttons";

        mount(context, {
          readFilmPage() {
            const [, pageType, myShowsId] = location.pathname.match(/^\/(view|movie)\/(\d+)/) ?? [];
            if (!myShowsId) return null;

            const heading = document.querySelector("h1.title__main-text, h1");
            const { title, year: headingYear } = splitTitleYear(heading?.textContent ?? "");
            const kinopoiskLink = document.querySelector(
              'a[href*="kinopoisk.ru/film/"], a[href*="kinopoisk.ru/series/"]',
            );
            const kinopoiskId = kinopoiskLink?.href.match(/kinopoisk\.ru\/(?:film|series)\/(\d+)/)?.[1] ?? null;

            return {
              pageKey: `${pageType}/${myShowsId}`,
              kinopoiskId,
              title,
              kind: pageType === "view" ? "series" : "film",
              originalTitle: document.querySelector(".ShowDetails-original")?.textContent.trim(),
              year: headingYear ?? document.title.match(/\((\d{4})\)/)?.[1],
            };
          },

          placeFilmButtons(buttons) {
            const ratingsRow = document.querySelector(".RatingInfo");
            const titleBlock = document.querySelector(".ShowDetails-title, .title__primary");
            const insertAfter = ratingsRow ?? titleBlock;
            if (!insertAfter) return;
            filmButtonRow.dataset.place = ratingsRow ? "ratings" : "title";
            placeInOrder([filmButtonRow], { insertAfter });
            placeInOrder(buttons, { appendTo: filmButtonRow });
          },
        });
      },
    },
  ];

  function findSite(hostname) {
    return SITES.find((site) =>
      site.hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`)),
    );
  }

  globalThis.CinemaSites = { SITES, findSite };
})();
