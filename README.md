# gidegide
## Movie AI Titles

Для цепляющих русских названий кино-нарезок добавь переменные окружения в Railway:

```bash
KINOPOISK_API_KEY=your_kinopoiskapiunofficial_key
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4o-mini
```

Если `OPENAI_API_KEY` не задан, worker использует русские fallback-шаблоны. Если `KINOPOISK_API_KEY` не задан, worker генерирует названия только по исходному названию VK-видео.

## Telegram bot

Настройте переменные из `.env.example`, примените Prisma-миграции обычной командой деплоя и зарегистрируйте webhook:

```bash
curl -X POST "$APP_BASE_URL/api/telegram/set-webhook" \
  -H "x-admin-secret: $TELEGRAM_WEBHOOK_SECRET"
```

`TELEGRAM_ALLOWED_CHAT_IDS` — список разрешённых Telegram chat ID через запятую. Токен бота и webhook secret хранятся только в переменных окружения.

### Ежедневный VK-автозабор

```bash
FACTORY_VK_AUTO_SOURCES_ENABLED=true
FACTORY_VK_AUTO_SOURCE_SCAN_HOUR=13
VK_SERVICE_TOKEN=
# Альтернатива сервисному токену:
VK_ACCESS_TOKEN=
VK_DOWNLOAD_PROVIDER=vkvideodownload
VK_DOWNLOAD_ALLOW_YTDLP_FALLBACK=false
VK_DOWNLOAD_PREFERRED_QUALITY=720p
VK_DOWNLOAD_RESOLVER_DELAY_MS=4000
```

Worker раз в пять минут проверяет разрешённые и включённые источники. По умолчанию запуск происходит после 13:00 в часовом поясе источника и только один раз за локальный день.

`VK_SERVICE_TOKEN` и `VK_ACCESS_TOKEN` необязательны. Для списка видео система сначала использует VK API при наличии токена, затем публичный HTML-раздел VK. `yt-dlp --flat-playlist` используется только при явно включённом `VK_DOWNLOAD_ALLOW_YTDLP_FALLBACK=true`.

Конкретные VK-видео скачиваются через `vkvideodownload.com`: worker получает прямую MP4-ссылку, предпочитает 720p со звуком, скачивает файл и передаёт его в существующий Movie Smart Cut pipeline. `yt-dlp` для одиночного видео также выключен по умолчанию и является только опциональным fallback.

Публичные или закрытые VK-группы, которые не отдают список видео гостям, невозможно автоматически перечислить без VK API-токена. Это не мешает скачиванию уже известной ссылки на публичное отдельное видео через `vkvideodownload.com`.

Команды Telegram: `/start`, `/menu`, `/help`, `/sources`, `/source_status`, `/run_today`, `/pause_sources`, `/resume_sources`, `/status`, `/queue`. После установки webhook endpoint `/api/telegram/set-webhook` также регистрирует меню команд Telegram через `setMyCommands`.

Управление на сайте: `/factory/auto-sources`. Там есть кнопки проверки списка, ручного запуска, паузы, удаления и настройки окна публикации.

### VK Auto Sources: какие ссылки лучше кидать

Для ежедневного автозабора без `VK_SERVICE_TOKEN` лучше отправлять боту не главную страницу группы, а именно публичный раздел видео:

```text
https://vk.com/videos-123456789
https://vk.com/video/@groupname
https://vkvideo.ru/@groupname
https://vk.com/video/playlist/-220018529_16
https://vk.ru/video/playlist/-220018529_16
https://vk.com/club123456789
https://vk.com/public123456789
```

Логика разделена на две части:

1. список видео из группы система получает через публичные HTML-страницы `vk.com`, `vk.ru`, `m.vk.com`, `m.vk.ru` и `vkvideo.ru`;
2. каждую конкретную ссылку вида `https://vk.com/video-123_456` downloader скачивает через `vkvideodownload.com`.

Если VK показывает список видео только после авторизации или скрывает его от гостей, источник добавится, но список не прочитается. В таком случае попробуйте ссылку формата `https://vk.com/videos-...` или `https://vk.com/video/@...`.


### Telegram UX для автозабора

`/start` и `/menu` показывают главное меню с кнопками: источники, запуск сегодня, задачи, очередь и ссылка на завод.

`/sources` показывает карточки источников. Для каждого источника доступны кнопки:

- Проверить список;
- Запустить сейчас;
- Пауза / Включить;
- Удалить;
- Настройки.

Если источник уже добавлен, повторная отправка ссылки не создаёт дубль: бот показывает карточку существующего источника и действия.

Если список видео не прочитался, бот предлагает следующие форматы:

```text
https://vk.com/video/@groupname
https://vk.com/videos-123456789
https://vk.com/video/playlist/-123456789_1
https://vk.ru/video/playlist/-123456789_1
```

Скачивание отдельных видео при этом продолжает работать через `vkvideodownload.com`.

## VK Auto Sources: cookies authorization

VK/VKVideo sometimes hides video lists from anonymous server requests. Single video downloads still go through `vkvideodownload.com`, but group/channel/playlist listing may need browser cookies from an account that can see the source.

Optional Railway variables for authenticated listing:

```env
VK_AUTH_MODE=cookies
VK_COOKIES_B64=
VK_COOKIES_PATH=
```

Preferred setup is `VK_COOKIES_B64`:

1. Open VK/VKVideo on your desktop browser and sign in.
2. Export cookies for `vk.com` and `vkvideo.ru` in Netscape `cookies.txt` format.
3. Convert the file to base64 in PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\cookies.txt")) | Set-Clipboard
```

4. Add the copied value to Railway Variables as `VK_COOKIES_B64` for both web and worker services.
5. Restart/redeploy web and worker.

Never commit cookies to GitHub and never send cookies in Telegram. Treat them like account credentials.

## VK Auto Sources: browser listing через Playwright

Если обычный HTML parser даже с `VK_COOKIES_B64` показывает `найдено ссылок: 0`, включите browser listing. Он открывает VK/VKVideo как настоящий headless Chromium, подставляет cookies и собирает ссылки на видео из DOM и network responses. Скачивание самих роликов при этом остаётся через `vkvideodownload.com`.

Railway variables для web и worker:

```env
VK_AUTH_MODE=cookies
VK_COOKIES_B64=...
# если строка длиннее лимита Railway, можно разбить:
VK_COOKIES_B64_1=...
VK_COOKIES_B64_2=...
VK_COOKIES_B64_3=...
VK_LISTING_PROVIDER=auto
VK_LISTING_ENABLE_PLAYWRIGHT=true
VK_LISTING_SCROLL_PAGES=6
VK_LISTING_WAIT_MS=6000
VK_LISTING_HEADLESS=true
PLAYWRIGHT_BROWSERS_PATH=0
```

Для Dockerfile Chromium устанавливается командой `npx playwright install chromium`. Если Railway build падает с ошибкой Chromium, выполните/добавьте `npx playwright install chromium` на build stage.

Telegram diagnostics:

- `/cookies_status` — безопасно показывает, видит ли бот cookies, домены и включён ли Playwright.
- `/sources` → `🔍 Проверить список` — показывает, какая стратегия нашла видео: HTML, yt-dlp или Playwright.

Значения cookies никогда не логируются и не отправляются в Telegram.
