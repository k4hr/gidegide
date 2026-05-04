import type { FactoryPublishTiming } from "@prisma/client";

const NEW_YORK_TIME_ZONE = "America/New_York";
const MOSCOW_TIME_ZONE = "Europe/Moscow";

const PUBLISH_SLOTS: Record<FactoryPublishTiming, number | null> = {
  NOW: null,
  NY_14: 14,
  NY_17: 17,
  NY_20: 20,
  NY_22: 22,
  USA_SMART: null,
};

const USA_SMART_MOSCOW_SLOTS = [21, 23, 1, 3, 5] as const;

export const USA_SMART_CLIPS_PER_SLOT = 2;

export type UsaSmartSlot = {
  index: number;
  moscowHour: number;
  scheduledAt: Date;
  label: string;
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

function addCalendarDays(
  input: {
    year: number;
    month: number;
    day: number;
  },
  days: number,
) {
  const next = new Date(
    Date.UTC(input.year, input.month - 1, input.day + days, 12, 0, 0),
  );

  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function addOneCalendarDay(input: {
  year: number;
  month: number;
  day: number;
}) {
  return addCalendarDays(input, 1);
}

function getMoscowDateForSmartSlot(input: {
  baseDate: {
    year: number;
    month: number;
    day: number;
  };
  previousHour: number | null;
  hour: number;
  dayOffset: number;
}) {
  let nextDayOffset = input.dayOffset;

  if (input.previousHour !== null && input.hour <= input.previousHour) {
    nextDayOffset += 1;
  }

  return {
    date: addCalendarDays(input.baseDate, nextDayOffset),
    dayOffset: nextDayOffset,
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

export function getUsaSmartUploadSlots(now = new Date()): UsaSmartSlot[] {
  const moscow = getTimeZoneParts(now, MOSCOW_TIME_ZONE);
  const currentMoscowMinutes = moscow.hour * 60 + moscow.minute;

  const firstSlotIndex = USA_SMART_MOSCOW_SLOTS.findIndex(
    (hour) => hour * 60 > currentMoscowMinutes,
  );

  const startIndex = firstSlotIndex === -1 ? 0 : firstSlotIndex;
  const baseDate = {
    year: moscow.year,
    month: moscow.month,
    day: moscow.day,
  };

  const orderedHours = [
    ...USA_SMART_MOSCOW_SLOTS.slice(startIndex),
    ...USA_SMART_MOSCOW_SLOTS.slice(0, startIndex),
  ];

  let previousHour: number | null = null;
  let dayOffset = firstSlotIndex === -1 ? 1 : 0;

  return orderedHours.map((hour, index) => {
    const slotDate = getMoscowDateForSmartSlot({
      baseDate,
      previousHour,
      hour,
      dayOffset,
    });

    previousHour = hour;
    dayOffset = slotDate.dayOffset;

    const scheduledAt = zonedTimeToUtc({
      timeZone: MOSCOW_TIME_ZONE,
      year: slotDate.date.year,
      month: slotDate.date.month,
      day: slotDate.date.day,
      hour,
      minute: 0,
    });

    return {
      index: index + 1,
      moscowHour: hour,
      scheduledAt,
      label: `${String(hour).padStart(2, "0")}:00 МСК — ${USA_SMART_CLIPS_PER_SLOT} ролика`,
    };
  });
}

export function getPublishTimingLabel(publishTiming: FactoryPublishTiming) {
  if (publishTiming === "NOW") return "Загрузить сейчас";
  if (publishTiming === "NY_14") return "14:00 New York = 21:00 МСК";
  if (publishTiming === "NY_17") return "17:00 New York = 00:00 МСК";
  if (publishTiming === "NY_20") return "20:00 New York = 03:00 МСК";
  if (publishTiming === "NY_22") return "22:00 New York = 05:00 МСК";

  return "Грамотный залив под USA: 21/23/01/03/05 МСК по 2 ролика";
}

export function formatScheduledAtForLabel(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: NEW_YORK_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatMoscowScheduledAtForLabel(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: MOSCOW_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
