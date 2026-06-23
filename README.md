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
- `/instagram_test_one` или `/test_one` — тестовый запуск: скачать и поставить в очередь только 1 видео.
- `/cancel_all_tasks` или `/cancel_all` — отменить все Instagram-задачи в очереди/обработке; опубликованные ролики не трогает.
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
Factory worker started · instagram queue dedupe v4
```

Если в старой задаче уже лежит битый локальный файл `592k` или временная CDN-ссылка Instagram, worker удалит невалидный локальный файл и попробует взять оригинальную ссылку Reel из `FactoryInstagramAutoSourceVideo`. Direct-curl больше не используется для Instagram/CDN/fbcdn/scontent ссылок.

## Instagram duplicate protection

Instagram Reels теперь дедуплицируются до создания `FactoryJob` по shortcode, нормализованной Reel/Post URL и нормализованному caption. Уже найденные, уже поставленные в очередь, скачанные, отрендеренные и опубликованные ролики блокируют повторную постановку. Если в БД уже накопились старые дубли, используй кнопку в боте `🛑 Отменить все задачи`, затем запускай `🧪 Загрузить 1 видео` для безопасного теста.

## Instagram deep scan / duplicates

Instagram auto sources intentionally do not use Railway env for tuning. Scan limits live in code:

- `lib/factory/instagram-config.ts`
- `lib/factory/factory-config.ts`

The scanner used to inspect only the latest 20 profile links. For accounts with hundreds/thousands of publications this made the bot report `available: 0` once the latest 20 were already saved. The current scanner scrolls deeper:

- normal scan: up to 300 profile items;
- Telegram deep scan: up to 1000 profile items via `/instagram_deep_scan` or the `🔎 Досканировать` button.

Telegram buttons/commands:

- `🔎 Досканировать` / `/instagram_deep_scan` — deep scan all Instagram sources for the chat;
- `🔎 Глубокий скан` on a source — deep scan only that source;
- `🛑 Отменить все задачи` — cancels queued/active Instagram tasks. Queued videos are released back to `NEW` so they can be tested again;
- `🧪 Загрузить 1 видео` / `/instagram_test_one` — queues one available Instagram video for testing.

After deploying changes, redeploy/restart both the web service and `gidegide-worker`, then reinstall Telegram webhook if the bot menu/buttons do not update.

## Instagram deep scan lock v6

Instagram deep scan can take several minutes. The bot and worker now store a per-source scan lock in the database (`scanStartedAt`, `scanLockUntil`, `scanMode`) so the same profile cannot be scanned by several webhook/worker processes at the same time.

If a deep scan is already running, the bot returns “Скан уже идёт” instead of starting another Playwright session. This prevents duplicate `list start` logs and reduces Instagram rate-limit risk.

Duplicate Reel logs are now summarized instead of printing hundreds of `duplicate reel skipped` lines.

After deploying this version, redeploy/restart both the web service and `gidegide-worker`. The worker log should contain:

```txt
Factory worker started · instagram scan lock v6
```
