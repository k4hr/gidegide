import type { FactoryPublishTiming } from "@prisma/client";

const NEW_YORK_TIME_ZONE = "Europe/Moscow";
const MOSCOW_TIME_ZONE = "Europe/Moscow";

export const USA_SMART_CLIPS_PER_SLOT = 1;

type RegularPublishTiming = Exclude<FactoryPublishTiming, "USA_SMART">;

const PUBLISH_SLOTS: Record<RegularPublishTiming, number | null> = {
  NOW: null,
  NY_14: 14,
  NY_17: 17,
  NY_20: 20,
  NY_22: 22,
};

const PUBLISH_LABELS: Record<FactoryPublishTiming, string> = {
  NOW: "Р—Р°РіСЂСѓР·РёС‚СЊ СЃРµР№С‡Р°СЃ",
  NY_14: "14:00 New York = 21:00 РњРЎРљ",
  NY_17: "17:00 New York = 00:00 РњРЎРљ",
  NY_20: "20:00 New York = 03:00 РњРЎРљ",
  NY_22: "22:00 New York = 05:00 РњРЎРљ",
  USA_SMART: "Р“СЂР°РјРѕС‚РЅС‹Р№ Р·Р°Р»РёРІ РїРѕРґ USA",
};

const USA_SMART_MOSCOW_SLOTS: Array<{
  index: number;
  hour: number;
  minute: number;
  label: string;
}> = [
  {
    index: 1,
    hour: 21,
    minute: 0,
    label: "21:00 РњРЎРљ вЂ” СЂРѕР»РёРє 1",
  },
  {
    index: 2,
    hour: 21,
    minute: 15,
    label: "21:15 РњРЎРљ вЂ” СЂРѕР»РёРє 2",
  },
  {
    index: 3,
    hour: 23,
    minute: 0,
    label: "23:00 РњРЎРљ вЂ” СЂРѕР»РёРє 3",
  },
  {
    index: 4,
    hour: 23,
    minute: 15,
    label: "23:15 РњРЎРљ вЂ” СЂРѕР»РёРє 4",
  },
  {
    index: 5,
    hour: 1,
    minute: 0,
    label: "01:00 РњРЎРљ вЂ” СЂРѕР»РёРє 5",
  },
  {
    index: 6,
    hour: 1,
    minute: 15,
    label: "01:15 РњРЎРљ вЂ” СЂРѕР»РёРє 6",
  },
  {
    index: 7,
    hour: 3,
    minute: 0,
    label: "03:00 РњРЎРљ вЂ” СЂРѕР»РёРє 7",
  },
  {
    index: 8,
    hour: 3,
    minute: 15,
    label: "03:15 РњРЎРљ вЂ” СЂРѕР»РёРє 8",
  },
  {
    index: 9,
    hour: 5,
    minute: 0,
    label: "05:00 РњРЎРљ вЂ” СЂРѕР»РёРє 9",
  },
  {
    index: 10,
    hour: 5,
    minute: 15,
    label: "05:15 РњРЎРљ вЂ” СЂРѕР»РёРє 10",
  },
];

function getTimeZoneParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const result: Record<string, number> = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      result[part.type] = Number(part.value);
    }
  }

  return {
    year: result.year,
    month: result.month,
    day: result.day,
    hour: result.hour === 24 ? 0 : result.hour,
    minute: result.minute,
    second: result.second,
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getTimeZoneParts(date, timeZone);

  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return asUtc - date.getTime();
}

function makeDateInTimeZone(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
  timeZone: string;
}) {
  const utcGuess = new Date(
    Date.UTC(
      input.year,
      input.month - 1,
      input.day,
      input.hour,
      input.minute,
      input.second ?? 0,
    ),
  );

  const offsetMs = getTimeZoneOffsetMs(utcGuess, input.timeZone);

  return new Date(utcGuess.getTime() - offsetMs);
}

function addDaysToDateParts(input: {
  year: number;
  month: number;
  day: number;
  days: number;
}) {
  const date = new Date(
    Date.UTC(input.year, input.month - 1, input.day + input.days, 12, 0, 0),
  );

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function getNextTimeInTimeZone(input: {
  hour: number;
  minute: number;
  timeZone: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const nowParts = getTimeZoneParts(now, input.timeZone);

  let targetParts = {
    year: nowParts.year,
    month: nowParts.month,
    day: nowParts.day,
  };

  let target = makeDateInTimeZone({
    ...targetParts,
    hour: input.hour,
    minute: input.minute,
    second: 0,
    timeZone: input.timeZone,
  });

  if (target.getTime() <= now.getTime()) {
    targetParts = addDaysToDateParts({
      ...targetParts,
      days: 1,
    });

    target = makeDateInTimeZone({
      ...targetParts,
      hour: input.hour,
      minute: input.minute,
      second: 0,
      timeZone: input.timeZone,
    });
  }

  return target;
}

export function getPublishTimingLabel(value: FactoryPublishTiming) {
  return PUBLISH_LABELS[value] ?? "Р—Р°РіСЂСѓР·РёС‚СЊ СЃРµР№С‡Р°СЃ";
}

export function getNextNewYorkPublishAt(value: FactoryPublishTiming) {
  if (value === "USA_SMART") {
    return null;
  }

  const hour = PUBLISH_SLOTS[value];

  if (hour === null) {
    return null;
  }

  return getNextTimeInTimeZone({
    hour,
    minute: 0,
    timeZone: NEW_YORK_TIME_ZONE,
  });
}

export function getUsaSmartUploadSlots() {
  return USA_SMART_MOSCOW_SLOTS.map((slot) => ({
    ...slot,
    scheduledAt: getNextTimeInTimeZone({
      hour: slot.hour,
      minute: slot.minute,
      timeZone: MOSCOW_TIME_ZONE,
    }),
  }));
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
