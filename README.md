# Cinema Helper

Добавляет кнопки Kinogo и Rutracker на страницы фильмов и сериалов в Кинопоиске и MyShows.

- **Kinogo** ищет фильм или сериал и открывает найденную страницу или поиск.
- **Rutracker** ищет раздачи по названию и году. Для просмотра результатов нужен аккаунт Rutracker.

## Установка

Выберите один способ. После установки обновите страницы Кинопоиска и MyShows, которые уже открыты.

### Браузеры на Chromium

Скачайте исходники через **Code → Download ZIP** и распакуйте архив. На странице расширений включите режим разработчика, нажмите «Загрузить распакованное» и выберите папку с `manifest.json`.

### Firefox Developer Edition 121+

Скачайте [cinema-helper.xpi](https://github.com/rrokot/cinema-helper/releases/latest/download/cinema-helper.xpi). В `about:config` задайте `xpinstall.signatures.required = false` для установки неподписанного пакета. Затем в `about:addons` выберите «Установить дополнение из файла…» в меню с шестерёнкой и укажите XPI.

### Tampermonkey 5.3+

[Установите Cinema Helper с GitHub](https://github.com/rrokot/cinema-helper/releases/latest/download/cinema-helper.user.js). Если браузер скачивает файл, вставьте эту ссылку в импорт по URL в панели Tampermonkey.

Tampermonkey проверяет новые версии по той же ссылке и обновляет скрипт по своим настройкам автообновления.

## Лицензия

[MIT](LICENSE)
