# AGENTS.md

Правила для агентов, работающих с этим проектом.

## Управление версией

- Semantic Versioning: `MAJOR.MINOR.PATCH`
- Всегда обновляй `package.json.version` при изменении
- Бамп на каждое значимое изменение
- `PATCH` — багфиксы, мелкие улучшения
- `MINOR` — новые возможности (флаги, опции)
- `MAJOR` — breaking changes

## CHANGELOG

- Всегда обновляй `CHANGELOG.md` при бампе версии
- Формат: Keep a Changelog (keepachangelog.com)
- Секции: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`
- Заголовок секции `[X.Y.Z] — YYYY-MM-DD`
- `[Unreleased]` для незакоммиченных изменений

## README

- Держи в актуальном состоянии
- Примеры команд должны работать
- Обновляй таблицу флагов при добавлении/изменении
- Не дублируй AGENTS.md в README и наоборот
- Сверяй README с фактическим `--help` выводом

## Коммиты

- Чистые, осмысленные сообщения
- Не коммить `node_modules/`, скриншоты, временные файлы
- `.gitignore` должен быть актуален
- Версию в `package.json` — в том же коммите, что и CHANGELOG

## Порядок при релизе

1. `CHANGELOG.md` — добавь секцию с датой
2. `package.json` — обнови версию
3. `README.md` — проверь актуальность
4. `package.json.files` — убедись, что `lib/` включён
5. `npm run verify:release` — check + full + package smoke
6. Коммит + тег

## Тесты

Тесты разделены на категории: unit (pure logic, без браузера) и smoke (CLI + Chromium).

- `npm run check` — lint + format check
- `npm test` — unit + quick smoke (обычная команда для повседневной разработки)
- `npm run test:unit` — только pure unit tests (секунды, без Chromium)
- `npm run test:smoke` — короткий representative CLI smoke (~10–20 сек)
- `npm run test:full` — unit + полный browser regression suite (перед завершением slice)
- `npm run test:package` — проверка установленного пакета из tgz (только перед релизом)
- `npm run verify` — check + unit + quick smoke
- `npm run verify:full` — check + полный suite
- `npm run verify:release` — check + полный suite + package smoke

Структура:

- `test/lib/` — unit tests для pure helpers (options, route-patterns, url-list)
- `test/smoke/helpers.mjs` — общие хелперы (CLI runner, assertions, temp dir)
- `test/smoke/quick.mjs` — representative CLI contract + минимальный browser smoke
- `test/smoke/full.mjs` — полный regression suite (все browser paths)
- `test/package/smoke.mjs` — package/installation smoke

Агент во время разработки запускает `npm test` или `npm run check`.
Перед завершением slice — `npm run test:full`.
Перед релизом — `npm run verify:release` (check + full + package).

## Линтинг и форматирование

- ESLint 10 flat config (`eslint.config.mjs`) + `eslint-plugin-n` + `eslint-plugin-unicorn`
- Prettier 3 (2 пробела, single quotes, no semicolons)
- `eslint-config-prettier` — отключает конфликтующие правила ESLint
- lint-staged + husky — pre-commit: eslint --fix + prettier --write
- Команды:
  - `npm run check` — lint + format check
  - `npm run lint` — проверка линтером
  - `npm run lint:fix` — автофикс линтера
  - `npm run format` — проверка форматирования
  - `npm run format:write` — автоформатирование

## Архитектура

```
mshot.js                    — thin CLI entry, parseArgs, dispatch single/batch
lib/options.js              — CLI options, defaults, help text, validation (no browser, no I/O)
lib/capture.js              — core page capture (navigate → stabilize → screenshot → crop)
lib/settle.js               — bounded font/image settling (no browser, no I/O)
lib/output.js               — file helpers (atomic write, safe filenames)
lib/batch.js                — batch orchestrator (1 browser, concurrency, manifest)
lib/discovery.js            — rendered link discovery (browser-dependent)
lib/manifest.js             — manifest record builders + write (no browser, no I/O except writeFileSync)
lib/route-patterns.js       — pure: urlToPattern, dedupeByPattern
lib/url-list.js             — pure: readUrlsFile, filterDuplicateCandidates
```

- `lib/capture.js` — принимает Playwright page, возвращает `{ buffer, limited, warnings, timings }`. НЕ запускает/не закрывает браузер. НЕ пишет файлы.
- `lib/settle.js` — bounded font/image settling via manual polling. Принимает Playwright page, возвращает `{ fontWaitMs, imageWaitMs, warnings }`. НЕ запускает/не закрывает браузер. НЕ пишет файлы. Единственный владелец ожидания fonts/images.
- `lib/output.js` — файловый I/O, без браузера.
- `lib/batch.js` — orchestrator: 1 browser на весь батч, discovery, dedup, concurrency, manifest. Не анализирует скриншоты.
- `lib/manifest.js` — чистые функции создания записей + writeFileSync.
- `lib/route-patterns.js`, `lib/url-list.js` — чистые функции, без I/O и браузера.
- `lib/discovery.js` — browser-dependent, но self-contained.
- Новые модули должны быть чистыми (без browser, без I/O), если возможно.

## Playwright compatibility flag

В `mshot.js` централизованно установлен:

```js
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1'
```

**Причина:** Playwright `page.screenshot()` internally ждёт `document.fonts.ready`, что неограниченно задерживается при pending `<img>` или `<font>` запросах. mshot уже выполняет bounded settle wait (через `--settle-timeout`), поэтому flag отключает дублирующее неограниченное ожидание.

**Защита:** regression-тесты в `test/smoke/settle.mjs` (fixture с 5s delayed image endpoint, `--settle-timeout 800`).

**При обновлении Playwright:** обязателен slow-resource regression test. Если флаг исчезнет — запасной путь: Chromium CDP `Page.captureScreenshot`.

## Текущая версия

**0.7.0**
