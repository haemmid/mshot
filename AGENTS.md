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

## Коммиты

- Чистые, осмысленные сообщения
- Не коммить `node_modules/`, скриншоты, временные файлы
- `.gitignore` должен быть актуален
- Версию в `package.json` — в том же коммите, что и CHANGELOG

## Порядок при релизе

1. `CHANGELOG.md` — добавь секцию с датой
2. `package.json` — обнови версию
3. `README.md` — проверь актуальность
4. Коммит + тег

## Линтинг и форматирование

- ESLint 9 flat config (`eslint.config.mjs`) + `eslint-plugin-n` + `eslint-plugin-unicorn`
- Prettier 3 (2 пробела, single quotes, no semicolons)
- `eslint-config-prettier` — отключает конфликтующие правила ESLint
- lint-staged + husky — pre-commit: eslint --fix + prettier --write
- Команды:
  - `npm run check` — lint + format check
  - `npm run lint` — проверка линтером
  - `npm run lint:fix` — автофикс линтера
  - `npm run format` — проверка форматирования
  - `npm run format:write` — автоформатирование

## Текущая версия

**0.3.0**
