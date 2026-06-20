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
https://vk.com/club123456789
https://vk.com/public123456789
```

Логика разделена на две части:

1. список видео из группы система получает через публичные HTML-страницы `vk.com`, `m.vk.com` и `vkvideo.ru`;
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
```

Скачивание отдельных видео при этом продолжает работать через `vkvideodownload.com`.
