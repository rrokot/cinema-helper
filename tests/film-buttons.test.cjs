const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { DOMParser } = require('linkedom');

const entries = {};
const context = vm.createContext({
  URL,
  CinemaPlatform: {
    requestKinogo: (message) => context.sendKinogoRequest(message),
    cacheStorage: {
      async get(key) { return key ? { [key]: entries[key] } : entries; },
      async set(values) { Object.assign(entries, values); },
      async remove(keys) { keys.forEach(key => delete entries[key]); },
    },
  },
});
vm.runInContext(fs.readFileSync('src/shared/kinogo.js', 'utf8'), context);
const source = fs.readFileSync('src/content/film-buttons.js', 'utf8');
vm.runInContext(source.replace(
  'globalThis.CinemaFilmButtons = { mount, placeInOrder, splitTitleYear };',
  'globalThis.helpers = { updateKinogoButtonFromSource, checkKinogo, readCachedKinogoLink, cacheFoundKinogoLink, kinogoSearchUrl, searchPageNumber, splitTitleYear };',
), context);
const { updateKinogoButtonFromSource, checkKinogo, readCachedKinogoLink, cacheFoundKinogoLink } = context.helpers;
const log = () => {};

test('Kinogo results match the normalized title and the requested release year', async () => {
  const results = [
    ['Резня', '2011', 'Резня в Чоппинг Молле (1986)', '/1-other.html', 'not-found'],
    ['Резня', '2011', 'Резня (2009)', '/1-reznja.html', 'not-found'],
    ['Резня', '2011', 'Резня (2011)', '/1-reznja.html', 'found'],
    ['Резня', '2011', 'Резня', '/1-reznja-2011.html', 'found'],
    ['Резня', '2011', 'Резня', '/1-reznja.html', 'not-found'],
    ['Резня 2', undefined, 'Резня', '/1-reznja.html', 'not-found'],
    ['Ёлки', '2010', 'Елки (2010)', '/1-yolki.html', 'found'],
    ['Резня', '2011', 'Резня (2011) смотреть онлайн в хорошем качестве', '/1-reznja.html', 'found'],
  ];
  context.DOMParser = DOMParser;
  for (const [title, year, linkText, href, status] of results) {
    context.sendKinogoRequest = async (message) => {
      return { html: message.type === 'check-kinogo-title'
        ? `<html><body><div id="dle-content"><a href="${href}">${linkText}</a></div></body></html>`
        : '<html><body><h1>Резня</h1></body></html>' };
    };
    const button = { dataset: {} };
    await updateKinogoButtonFromSource(log, { title, year }, button);
    assert.equal(button.dataset.status, status, linkText);
  }
});

test('a result with no year in its link is verified using the film page', async () => {
  const messages = [];
  context.sendKinogoRequest = async (message) => {
    messages.push(message);
    return { html: message.type === 'check-kinogo-title' ? 'search' : 'detail' };
  };
  let detailYear = '2011';
  const links = [
    { textContent: 'Резня в Чоппинг Молле', getAttribute: () => '/1-wrong.html' },
    { textContent: 'Резня', getAttribute: () => '/2-reznja.html' },
  ];
  context.DOMParser = class {
    parseFromString(html) {
      if (html === 'search') return {
        querySelector: () => ({ querySelectorAll: () => links }),
        querySelectorAll: () => [],
        body: { textContent: '', innerText: '' },
      };
      return {
        querySelector: selector => ({ textContent: selector === 'h1' ? 'Резня' : 'Резня смотреть онлайн' }),
        body: { textContent: `Год выпуска: ${detailYear}` },
      };
    }
  };
  const button = { dataset: {} };
  const page = { title: 'Резня', year: '2011' };
  await updateKinogoButtonFromSource(log, page, button);
  assert.equal(button.dataset.status, 'found');
  assert.equal(button.href, 'https://kinogo.media/2-reznja.html');
  assert.equal(messages.length, 2);
  assert.equal(messages[1].type, 'check-kinogo-page');
  detailYear = '2009';
  const otherButton = { dataset: {} };
  await updateKinogoButtonFromSource(log, page, otherButton);
  assert.equal(otherButton.dataset.status, 'not-found');
});

test('search URLs trim and encode titles and pagination stays within the same search', () => {
  assert.equal(context.helpers.kinogoSearchUrl(' Тихий рейс '),
    'https://kinogo.media/search/%D0%A2%D0%B8%D1%85%D0%B8%D0%B9%20%D1%80%D0%B5%D0%B9%D1%81');
  assert.equal(context.helpers.searchPageNumber('/search/Резня/page/2', 'Резня'), 2);
  assert.equal(context.helpers.searchPageNumber('https://evil.example/search/Резня/page/2', 'Резня'), null);
  assert.equal(context.helpers.searchPageNumber('/search/Другой/page/2', 'Резня'), null);
  assert.equal(context.helpers.searchPageNumber('/search/Резня/page/999', 'Резня'), null);
});

test('search follows pagination and selects the exact title and year on page two', async () => {
  const requests = [];
  context.sendKinogoRequest = async (message) => {
    requests.push(message);
    return { html: String(message.page) };
  };
  const link = (text, href) => ({ textContent: text, getAttribute: () => href });
  context.DOMParser = class {
    parseFromString(page) {
      const results = page === '1'
        ? [link('Резня в Чоппинг Молле (1986)', '/1-other.html')]
        : [link('Резня (2011)', '/27383-reznja.html')];
      return {
        querySelector: () => ({ querySelectorAll: () => results }),
        querySelectorAll: () => [link('2', '/search/Резня/page/2')],
        body: { textContent: '' },
      };
    }
  };
  const button = { dataset: {} };
  await updateKinogoButtonFromSource(log, { title: 'Резня', year: '2011' }, button);
  assert.equal(button.dataset.status, 'found');
  assert.equal(button.href, 'https://kinogo.media/27383-reznja.html');
  assert.deepEqual(requests.map(request => request.page), [1, 2]);
});

test('old cached matches are rechecked; new matches retain title and year', async () => {
  entries['kinogoLink:557837'] = {
    href: 'https://kinogo.media/wrong.html', savedAt: Date.now(),
  };
  assert.equal(await readCachedKinogoLink('557837', 'Резня', '2011'), null);
  await cacheFoundKinogoLink('557837', 'https://kinogo.media/carnage-2011.html', 'Резня', '2011');
  assert.equal(await readCachedKinogoLink('557837', 'Резня', '2011'), 'https://kinogo.media/carnage-2011.html');
  assert.equal(await readCachedKinogoLink('557837', 'Резня', '2009'), null);
});

test('search reads and deduplicates pagination links without executing onclick handlers', async () => {
  const html = `<html><body><main id="dle-content">
    <nav>
      <a href="#" onclick="list_submit(4)">4</a>
      <a href="#" onclick="list_submit(2)">2</a>
      <a href="#" onclick="list_submit(3)">3</a>
      <a href="#" onclick="list_submit(2)">Следующая</a>
    </nav>
  </main></body></html>`;
  const requests = [];
  context.DOMParser = DOMParser;
  context.sendKinogoRequest = async (message) => {
    requests.push(message.page);
    return { html: message.page === 1 ? html : '<html><body><div id="dle-content"></div></body></html>' };
  };
  const button = { dataset: {} };
  await updateKinogoButtonFromSource(log, { title: 'Резня', year: '2011' }, button);
  assert.deepEqual(requests, [1, 2, 3, 4]);
  assert.equal(button.dataset.status, 'not-found');
  assert.equal(context.helpers.searchPageNumber('#', 'Резня', 'javascript:list_submit(2); return(false)'), 2);
  assert.equal(context.helpers.searchPageNumber('#', 'Резня', 'alert(2)'), null);
  assert.equal(context.helpers.searchPageNumber('#', 'Резня', 'list_submit(2); alert(1)'), null);
});

test('search verifies the release year of films with identical titles on page two', async () => {
  const requests = [];
  const searchPages = {
    1: `<main id="dle-content">
      <a href="/410-tihij-rejs-na-sever.html">Тихий рейс на север</a>
      <a href="#" onclick="list_submit(2)">2</a>
    </main>`,
    2: `<main id="dle-content">
      <a href="/411-tihij-rejs.html">Тихий рейс</a>
      <a href="/412-tihij-rejs.html">Тихий рейс</a>
      <a href="/413-tihij-rejs.html">Тихий рейс</a>
    </main>`,
  };
  const releaseYears = {
    '/411-tihij-rejs.html': '2008',
    '/412-tihij-rejs.html': '2011',
    '/413-tihij-rejs.html': '2015',
  };
  context.DOMParser = DOMParser;
  context.sendKinogoRequest = async (message) => {
    requests.push(message);
    if (message.type === 'check-kinogo-title') {
      return { html: `<html><body>${searchPages[message.page]}</body></html>` };
    }
    const year = releaseYears[new URL(message.href).pathname];
    return { html: `<html><body><h1>Тихий рейс (${year})</h1></body></html>` };
  };
  const button = { dataset: {} };
  await updateKinogoButtonFromSource(log, { title: 'Тихий рейс', year: '2011' }, button);
  assert.equal(button.dataset.status, 'found');
  assert.equal(button.href, 'https://kinogo.media/412-tihij-rejs.html');
  assert.deepEqual(requests.filter(r => r.type === 'check-kinogo-title').map(r => r.page), [1, 2]);
  assert.equal(requests.filter(r => r.type === 'check-kinogo-page').length, 3);
});

test('series with matching original titles and different years is offered with its year; films remain strict', async () => {
  context.DOMParser = DOMParser;
  context.sendKinogoRequest = async (message) => {
    return { html: message.type === 'check-kinogo-title'
      ? '<html><body><div id="dle-content"><a href="/19843-klinika.html">Клиника (11 сезон)</a></div></body></html>'
      : '<html><body><h1>Клиника (2001)</h1><div class="sd-line">Оригинальное название: Scrubs</div></body></html>' };
  };
  const page = { title: 'Клиника', year: '2026', kind: 'series', originalTitle: 'Scrubs' };
  const button = { dataset: {} };
  await updateKinogoButtonFromSource(log, page, button);
  assert.equal(button.dataset.status, 'related');
  assert.equal(button.textContent, 'Kinogo: 2001');
  assert.equal(button.href, 'https://kinogo.media/19843-klinika.html');
  const film = { dataset: {} };
  await updateKinogoButtonFromSource(log, { ...page, kind: 'film' }, film);
  assert.equal(film.dataset.status, 'not-found');
  const differentOriginal = { dataset: {} };
  await updateKinogoButtonFromSource(log, { ...page, originalTitle: 'The Clinic' }, differentOriginal);
  assert.equal(differentOriginal.dataset.status, 'not-found');
});

test('MyShows adapter reads the original series title and falls back to the year in the document title', () => {
  let adapter;
  const document = new DOMParser().parseFromString(
    `<html><head><title>Маяк среди облаков / A Beacon in the Clouds (2026)</title></head><body>
      <h1 class="title__main-text">Маяк среди облаков</h1>
      <p class="ShowDetails-original">A Beacon in the Clouds</p>
    </body></html>`,
    'text/html',
  );
  const siteContext = vm.createContext({
    document, location: { pathname: '/view/425/' },
    CinemaFilmButtons: {
      mount(_context, filmPageAdapter) { adapter = filmPageAdapter; },
      placeInOrder() {}, splitTitleYear: context.helpers.splitTitleYear,
    },
  });
  vm.runInContext(fs.readFileSync('src/content/sites.js', 'utf8'), siteContext);
  siteContext.CinemaSites.findSite('myshows.me').init({});
  const page = adapter.readFilmPage();
  assert.equal(page.title, 'Маяк среди облаков');
  assert.equal(page.year, '2026');
  assert.equal(page.kind, 'series');
  assert.equal(page.originalTitle, 'A Beacon in the Clouds');
});

test('content scripts put Kinopoisk buttons back when the page replaces its button row', async () => {
  const document = new DOMParser().parseFromString(
    '<html><body><h1>Резня (2011)</h1><div class="styles_buttonsContainer"></div></body></html>',
    'text/html',
  );
  let updateAfterMutation;
  const pageContext = vm.createContext({
    document, URL, DOMParser, console,
    location: { hostname: 'www.kinopoisk.ru', pathname: '/film/557837/' },
    MutationObserver: class {
      constructor(update) { updateAfterMutation = update; }
      observe() {}
    },
    browser: {
      storage: {
        sync: { async get(defaults) { return defaults; } },
        local: {
          async get() { return {}; },
          async set() {},
        },
        onChanged: { addListener() {} },
      },
      runtime: { async sendMessage() {
        return { html: '<html><body><div id="dle-content"><a href="/1-reznja.html">Резня (2011)</a></div></body></html>' };
      } },
    },
  });
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  for (const script of manifest.content_scripts[0].js) {
    await vm.runInContext(fs.readFileSync(script, 'utf8'), pageContext);
  }
  await new Promise(setImmediate);
  const originalRow = document.querySelector('.styles_buttonsContainer');
  const [kinogo, rutracker] = originalRow.children;
  assert.equal(kinogo.href, 'https://kinogo.media/1-reznja.html');
  assert.equal(new URL(rutracker.href).searchParams.get('nm'), 'Резня 2011');

  const replacementRow = originalRow.cloneNode(false);
  originalRow.replaceWith(replacementRow);
  updateAfterMutation();
  updateAfterMutation();
  assert.deepEqual([...replacementRow.children], [kinogo, rutracker]);
});

test('a missing primary result falls back to a mirror and resolves relative links within its section', async () => {
  const requests = [];
  context.DOMParser = DOMParser;
  context.sendKinogoRequest = async (message) => {
    requests.push(message);
    if (message.type === 'check-kinogo-page') return { html: '<html><body><h1>Остановись и гори (2014)</h1></body></html>' };
    return { html: message.origin === 'https://kinogo.online'
      ? '<html><body><div id="dle-content"><a href="/serialy/35599-ostanovis-i-gori.html">Остановись и гори</a></div></body></html>'
      : '<html><body><div id="dle-content"></div></body></html>' };
  };
  const button = { dataset: {} };
  await checkKinogo(log, { title: 'Остановись и гори', year: '2014', kind: 'series' }, button);
  assert.equal(button.dataset.status, 'found');
  assert.equal(button.href, 'https://kinogo.online/serialy/35599-ostanovis-i-gori.html');
  assert.deepEqual(requests.filter(r => r.type === 'check-kinogo-title').map(r => r.origin),
    ['https://kinogo.media', 'https://kinogo.online']);
});

test('a related primary series stays selected until the mirror finds an exact match', async () => {
  context.DOMParser = DOMParser;
  const primaryHref = 'https://kinogo.media/1-scrubs.html';
  const fallbackHref = 'https://kinogo.online/2-scrubs.html';
  for (const fallbackYear of ['2010', '2026']) {
    context.sendKinogoRequest = async (message) => {
      if (message.type === 'check-kinogo-title') {
        const href = message.origin === 'https://kinogo.media' ? primaryHref : fallbackHref;
        return { html: `<html><body><div id="dle-content"><a href="${href}">Клиника</a></div></body></html>` };
      }
      const year = message.href === primaryHref ? '2001' : fallbackYear;
      return { html: `<html><body><h1>Клиника (${year})</h1><div class="sd-line">Оригинальное название: Scrubs</div></body></html>` };
    };
    const button = { dataset: {} };
    await checkKinogo(log, { title: 'Клиника', year: '2026', kind: 'series', originalTitle: 'Scrubs' }, button);
    const fallbackIsExact = fallbackYear === '2026';
    assert.equal(button.dataset.status, fallbackIsExact ? 'found' : 'related');
    assert.equal(button.href, fallbackIsExact ? fallbackHref : primaryHref);
    assert.equal(button.textContent, fallbackIsExact ? 'Kinogo' : 'Kinogo: 2001');
  }
});
