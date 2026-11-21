# Cinema Helper

Cinema Helper добавляет кнопки на страницы фильмов и сериалов в Кинопоиске и MyShows.

- **Kinogo** открывает страницу фильма, сериала или поиска на Kinogo.
- **Rutracker** открывает поиск раздач по названию и году. Чтобы увидеть результаты, войдите в аккаунт Rutracker.

## Установка

### Браузеры на Chromium

1. Скачайте архив проекта через **Code → Download ZIP**.
2. Распакуйте архив.
3. Откройте страницу расширений браузера.
4. Включите режим разработчика.
5. Нажмите «Загрузить распакованное».
6. Выберите папку с файлом `manifest.json`.

### Firefox Developer Edition 121+

1. Скачайте [cinema-helper.xpi](https://github.com/rrokot/cinema-helper/releases/latest/download/cinema-helper.xpi).
2. Откройте `about:config`.
3. Установите для `xpinstall.signatures.required` значение `false`. Это разрешит установку пакета без подписи.
4. Откройте `about:addons`.
5. В меню с шестерёнкой выберите «Установить дополнение из файла…».
6. Выберите скачанный файл `cinema-helper.xpi`.

### Tampermonkey 5.3+

1. Откройте [ссылку на установку скрипта](https://github.com/rrokot/cinema-helper/releases/latest/download/cinema-helper.user.js).
2. Подтвердите установку в Tampermonkey.

Если браузер скачал файл, откройте импорт по URL в панели Tampermonkey. Вставьте ссылку на скрипт. Подтвердите установку.

Tampermonkey проверяет эту ссылку на наличие новой версии. Скрипт обновляется по настройкам Tampermonkey.

## Лицензия

[MIT](LICENSE)
