# REDFILM Content Factory

## Instagram auto sources

Обычные Instagram-настройки больше не нужно добавлять в Railway env. Они лежат в коде:

- `lib/factory/instagram-config.ts` — лимиты, cooldown, delays, список за один запуск, таймауты.
- `lib/factory/factory-config.ts` — лимиты Telegram-статусов и первичного скана.

Секреты нельзя хранить в коде. Instagram cookies/session сохраняются через Telegram-бота в БД:

```txt
/set_instagram_cookies
```

После команды можно отправить `cookies.txt` файлом или вставить cookies текстом после команды. Бот сохранит значение в `FactorySecret` под ключом `instagram.cookies`, не будет логировать содержимое и не будет показывать его обратно.

## Telegram commands

- `/instagram_sources` или `/sources` — источники и запас роликов по каждому Instagram-аккаунту.
- `/instagram_run_today` — выбрать окно публикации по МСК и запустить ручной забор.
- `/instagram_run_today 23` — запустить сейчас и разложить публикации до 23:00 МСК.
- `/status` или `/instagram_status` — последние задачи: загрузка, рендер, публикация, опубликовано, ошибка.
- `/queue` — очередь обработки: downloading/rendering/publishing/waiting/published.
- `/set_instagram_cookies` — сохранить Instagram cookies/session в БД.
- `/instagram_pause` — поставить Instagram-источники на паузу.
- `/instagram_resume` — включить Instagram-источники.

## Railway env

Не добавляй пачку Instagram-переменных в Railway. Для Instagram нужны только уже существующие системные секреты проекта, например Telegram/DB/YouTube/R2. Числовые настройки и feature flags лежат в коде, cookies — в БД через бота.

## Checks

```bash
npx prisma validate
npx prisma generate
npm run build
```

## Instagram worker download guard

После обновления Instagram auto source обязательно перезапусти именно worker-сервис (`gidegide-worker`), не только web-сервис. В логах нового worker должно появиться:

```txt
Factory worker started · instagram download guard v3
```

Если в старой задаче уже лежит битый локальный файл `592k` или временная CDN-ссылка Instagram, worker удалит невалидный локальный файл и попробует взять оригинальную ссылку Reel из `FactoryInstagramAutoSourceVideo`. Direct-curl больше не используется для Instagram/CDN/fbcdn/scontent ссылок.
