const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('background fetches the current search route and validates pagination and detail origins', async () => {
  let handler;
  const requested = [];
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  const context = vm.createContext({
    URL, AbortController, setTimeout, clearTimeout, console,
    browser: { storage: { local: { async set() {} } }, runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener(fn) { handler = fn; } },
    } },
    async fetch(url) {
      requested.push(url.href);
      return { ok: true, url: url.href, text: async () => '<html></html>' };
    },
  });
  for (const script of manifest.background.scripts.slice(1)) {
    vm.runInContext(fs.readFileSync(script, 'utf8'), context);
  }
  const sender = { url: 'https://www.kinopoisk.ru/film/557837/' };
  for (const page of [1, 2]) {
    await new Promise(resolve => {
      assert.equal(handler({ type: 'check-kinogo-title', title: 'Резня', page }, sender, resolve), true);
    });
  }
  assert.deepEqual(requested, [
    'https://kinogo.media/search/%D0%A0%D0%B5%D0%B7%D0%BD%D1%8F',
    'https://kinogo.media/search/%D0%A0%D0%B5%D0%B7%D0%BD%D1%8F/page/2',
  ]);
  assert.equal(handler({ type: 'check-kinogo-title', title: 'Резня', page: 999 }, sender, () => {}), false);
  assert.equal(handler({ type: 'check-kinogo-page', href: 'https://evil.example/1-film.html' }, sender, () => {}), false);
  assert.equal(handler({ type: 'check-kinogo-title', title: 'Резня' }, { url: 'https://evil.example' }, () => {}), false);
  await new Promise(resolve => {
    assert.equal(handler({ type: 'check-kinogo-title', title: 'Остановись и гори', origin: 'https://kinogo.online' }, sender, resolve), true);
  });
  assert.equal(requested.at(-1), 'https://kinogo.online/search/%D0%9E%D1%81%D1%82%D0%B0%D0%BD%D0%BE%D0%B2%D0%B8%D1%81%D1%8C%20%D0%B8%20%D0%B3%D0%BE%D1%80%D0%B8');
  await new Promise(resolve => {
    assert.equal(handler({ type: 'check-kinogo-page', href: 'https://kinogo.online/serialy/35599-ostanovis-i-gori.html' }, sender, resolve), true);
  });
  assert.equal(requested.at(-1), 'https://kinogo.online/serialy/35599-ostanovis-i-gori.html');
  assert.equal(handler({ type: 'check-kinogo-title', title: 'test', origin: 'https://evil.example' }, sender, () => {}), false);
});
