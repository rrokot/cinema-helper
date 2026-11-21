const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { DOMParser } = require('linkedom');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const userscriptFiles = [
  'src/shared/kinogo.js',
  'userscript/platform.js',
  ...manifest.content_scripts[0].js.filter(path =>
    path !== 'src/shared/webextension.js' && path !== 'src/shared/kinogo.js'),
];

async function openKinopoiskInTampermonkey(values, requests) {
  const document = new DOMParser().parseFromString(
    '<html><body><h1>Резня (2011)</h1><div class="styles_buttonsContainer"></div></body></html>',
    'text/html',
  );
  const menuCommands = [];
  const location = {
    hostname: 'www.kinopoisk.ru',
    pathname: '/film/557837/',
    reloaded: false,
    reload() { this.reloaded = true; },
  };
  const context = vm.createContext({
    DOMParser, URL, document, location, console, setTimeout, clearTimeout,
    MutationObserver: class { observe() {} },
    GM_registerMenuCommand(_label, callback) { menuCommands.push(callback); },
    GM: {
      xmlHttpRequest(request) {
        requests.push(request);
        const { origin, pathname } = new URL(request.url);
        let body = '<div id="dle-content"></div>';
        if (pathname === '/123-reznja.html') {
          body = '<h1>Резня (2011)</h1>';
        } else if (origin === 'https://kinogo.online') {
          body = '<div id="dle-content"><a href="/123-reznja.html">Резня</a></div>';
        }
        const response = Promise.resolve({
          finalUrl: request.url,
          status: 200,
          responseText: `<html><body>${body}</body></html>`,
        });
        response.abort = () => {};
        return response;
      },
      async getValues(keysOrDefaults) {
        const defaults = Array.isArray(keysOrDefaults) ? {} : keysOrDefaults;
        const keys = Array.isArray(keysOrDefaults) ? keysOrDefaults : Object.keys(defaults);
        return Object.fromEntries(keys.map(key => [key, values.get(key) ?? defaults[key]]));
      },
      async setValues(entries) {
        for (const [key, value] of Object.entries(entries)) values.set(key, value);
      },
      async listValues() { return [...values.keys()]; },
      async deleteValues(keys) { keys.forEach(key => values.delete(key)); },
      addValueChangeListener() {},
    },
  });
  for (const path of userscriptFiles) {
    await vm.runInContext(fs.readFileSync(path, 'utf8'), context);
  }
  await new Promise(setImmediate);
  return { document, menuCommands, location };
}

test('Tampermonkey uses the mirror, keeps its link cache and reloads when toggled', async () => {
  const cachedFilmUrl = 'https://kinogo.online/123-reznja.html';
  const values = new Map([
    ['kinogoLink:123', { savedAt: 0 }],
  ]);
  const requests = [];

  const firstPage = await openKinopoiskInTampermonkey(values, requests);
  assert.deepEqual(requests.map(({ url }) => url), [
    'https://kinogo.media/search/%D0%A0%D0%B5%D0%B7%D0%BD%D1%8F',
    'https://kinogo.online/search/%D0%A0%D0%B5%D0%B7%D0%BD%D1%8F',
    cachedFilmUrl,
  ]);
  assert.ok(requests.every(({ method, anonymous }) => method === 'GET' && anonymous));
  assert.equal(firstPage.document.querySelector('.cinema-btn--kinogo').href, cachedFilmUrl);
  assert.equal(values.has('kinogoLink:123'), false);
  assert.equal(values.get('kinogoLink:557837').href, cachedFilmUrl);

  const cachedPage = await openKinopoiskInTampermonkey(values, requests);
  assert.equal(cachedPage.document.querySelector('.cinema-btn--kinogo').href, cachedFilmUrl);
  assert.equal(requests.length, 3);

  await cachedPage.menuCommands[0]();
  assert.equal(cachedPage.location.reloaded, true);
  assert.equal(values.get('enabled'), false);
  const disabledPage = await openKinopoiskInTampermonkey(values, requests);
  assert.equal(disabledPage.document.querySelector('.cinema-btn'), null);
});
