# gidegide
## Movie AI Titles

Для цепляющих русских названий кино-нарезок добавь переменные окружения в Railway:

```bash
KINOPOISK_API_KEY=your_kinopoiskapiunofficial_key
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4o-mini
```

Если `OPENAI_API_KEY` не задан, worker использует русские fallback-шаблоны. Если `KINOPOISK_API_KEY` не задан, worker генерирует названия только по исходному названию VK-видео.
