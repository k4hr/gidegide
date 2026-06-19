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
VK_SERVICE_TOKEN=your_vk_service_token
# Альтернатива сервисному токену:
VK_ACCESS_TOKEN=
```

Worker раз в пять минут проверяет разрешённые и включённые источники. По умолчанию запуск происходит после 13:00 в часовом поясе источника и только один раз за локальный день. Без VK-токена система пробует `yt-dlp --flat-playlist`.

Команды Telegram: `/sources`, `/source_status`, `/run_today`, `/pause_sources`, `/resume_sources`.

Управление на сайте: `/factory/auto-sources`.
