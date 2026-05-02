import type { FactoryPublishTiming } from "@prisma/client";

const NEW_YORK_TIME_ZONE = "America/New_York";

const PUBLISH_SLOTS: Record<FactoryPublishTiming, number | null> = {
  NOW: null,
  NY_14: 14,
  NY_17: 17,
  NY_20: 20,
  NY_22: 22,
};

type TimeZoneParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getTimeZoneParts(date: Date, timeZone: string): TimeZoneParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getTimeZoneParts(date, timeZone);

  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return zonedAsUtc - date.getTime();
}

function zonedTimeToUtc(input: {
  timeZone: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}) {
  const localAsUtc = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
    0,
  );

  let utc = localAsUtc;

  for (let i = 0; i < 3; i += 1) {
    const offset = getTimeZoneOffsetMs(new Date(utc), input.timeZone);
    utc = localAsUtc - offset;
  }

  return new Date(utc);
}

function addOneCalendarDay(input: {
  year: number;
  month: number;
  day: number;
}) {
  const next = new Date(
    Date.UTC(input.year, input.month - 1, input.day + 1, 12, 0, 0),
  );

  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

export function getNextNewYorkPublishAt(
  publishTiming: FactoryPublishTiming,
  now = new Date(),
) {
  const slotHour = PUBLISH_SLOTS[publishTiming];

  if (slotHour === null) {
    return null;
  }

  const ny = getTimeZoneParts(now, NEW_YORK_TIME_ZONE);

  let publishDate = {
    year: ny.year,
    month: ny.month,
    day: ny.day,
  };

  const alreadyPassedToday = ny.hour > slotHour || ny.hour === slotHour;

  if (alreadyPassedToday) {
    publishDate = addOneCalendarDay(publishDate);
  }

  return zonedTimeToUtc({
    timeZone: NEW_YORK_TIME_ZONE,
    year: publishDate.year,
    month: publishDate.month,
    day: publishDate.day,
    hour: slotHour,
    minute: 0,
  });
}

export function getPublishTimingLabel(publishTiming: FactoryPublishTiming) {
  if (publishTiming === "NOW") return "Загрузить сейчас";
  if (publishTiming === "NY_14") return "14:00 New York = 21:00 МСК";
  if (publishTiming === "NY_17") return "17:00 New York = 00:00 МСК";
  if (publishTiming === "NY_20") return "20:00 New York = 03:00 МСК";
  return "22:00 New York = 05:00 МСК";
}

export function formatScheduledAtForLabel(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: NEW_YORK_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
