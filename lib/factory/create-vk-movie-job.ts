import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/factory/db-retry";

export type CreateVkMovieJobInput = {
  sourceUrl: string;
  movieTitle?: string;
  description?: string;
  accountId?: string;
  templateId?: string | null;
  clipCount: number;
  clipSeconds: number;
  scheduleMode: "NOW" | "WINDOW";
  scheduleStartHour: number;
  scheduleEndHour: number;
  scheduleIntervalMinutes: number;
  scheduleStartAt?: Date | null;
  scheduleEndAt?: Date | null;
  scheduleDistribution?: "INTERVAL" | "EVEN";
  timeZone?: string;
  telegramChatId?: string;
  scheduledAt?: Date | null;
};

type ScheduleConfig = {
  type: "WINDOW_INTERVAL" | "WINDOW_EVEN";
  startHour: number;
  endHour: number;
  intervalMinutes: number;
  timeZone: string;
  startAt?: string;
  endAt?: string;
  clipCount?: number;
};

function timeZoneParts(date: Date, timeZone: string) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
}

function firstScheduledAt(config: ScheduleConfig | null) {
  if (!config) return null;

  if (config.type === "WINDOW_EVEN" && config.startAt) {
    const startAt = new Date(config.startAt);
    return Number.isFinite(startAt.getTime()) ? startAt : null;
  }

  const now = new Date();
  const parts = timeZoneParts(now, config.timeZone);
  const hour = parts.hour === 24 ? 0 : parts.hour;
  const nowMinutes = hour * 60 + (parts.minute || 0);
  const start = config.startHour * 60;
  const end = config.endHour * 60;
  let dayOffset = 0;
  let targetMinutes = start;
  if (nowMinutes >= start && nowMinutes < end) {
    targetMinutes = start + Math.ceil((nowMinutes - start) / config.intervalMinutes) * config.intervalMinutes;
  }
  if (nowMinutes >= end || targetMinutes >= end) {
    dayOffset = 1;
    targetMinutes = start;
  }
  const guess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset, Math.floor(targetMinutes / 60), targetMinutes % 60));
  const represented = timeZoneParts(guess, config.timeZone);
  const offset = Date.UTC(represented.year, represented.month - 1, represented.day, represented.hour === 24 ? 0 : represented.hour, represented.minute, represented.second) - guess.getTime();
  return new Date(guess.getTime() - offset);
}

function buildSchedule(input: {
  mode: "NOW" | "WINDOW";
  startHour: number;
  endHour: number;
  intervalMinutes: number;
  timeZone: string;
  clipCount: number;
  startAt?: Date | null;
  endAt?: Date | null;
  distribution?: "INTERVAL" | "EVEN";
}): ScheduleConfig | null {
  if (input.mode !== "WINDOW") return null;

  if (input.distribution === "EVEN" && input.startAt && input.endAt) {
    const intervalMinutes = Math.max(1, Math.round((input.endAt.getTime() - input.startAt.getTime()) / Math.max(1, input.clipCount) / 60000));
    return {
      type: "WINDOW_EVEN",
      startHour: input.startHour,
      endHour: input.endHour,
      intervalMinutes,
      timeZone: input.timeZone,
      startAt: input.startAt.toISOString(),
      endAt: input.endAt.toISOString(),
      clipCount: input.clipCount,
    };
  }

  return {
    type: "WINDOW_INTERVAL",
    startHour: input.startHour,
    endHour: input.endHour,
    intervalMinutes: input.intervalMinutes,
    timeZone: input.timeZone,
  };
}

function scheduleLabel(schedule: ScheduleConfig | null, clipCount: number, clipSeconds: number) {
  if (!schedule) return `VK Movie Smart · ${clipCount} нарезок · ${clipSeconds} сек`;
  if (schedule.type === "WINDOW_EVEN" && schedule.startAt && schedule.endAt) {
    return `VK Movie Smart · ${clipCount} нарезок · ${clipSeconds} сек · равномерно ${schedule.startHour}:00–${schedule.endHour}:00 / ~${schedule.intervalMinutes} мин`;
  }
  return `VK Movie Smart · ${clipCount} нарезок · ${clipSeconds} сек · окно ${schedule.startHour}:00–${schedule.endHour}:00 / ${schedule.intervalMinutes} мин`;
}

export async function createVkMovieJob(input: CreateVkMovieJobInput) {
  const account = input.accountId
    ? await withDbRetry(() => prisma.factoryAccount.findUnique({ where: { id: input.accountId } }))
    : await withDbRetry(() =>
        prisma.factoryAccount.findFirst({
          where: { platform: "YOUTUBE" },
          orderBy: { createdAt: "asc" },
        }),
      );
  if (!account) throw new Error("Нет доступного YouTube-аккаунта для публикации");

  if (input.templateId) {
    const template = await withDbRetry(() => prisma.factoryTemplate.findUnique({ where: { id: input.templateId! }, select: { id: true } }));
    if (!template) throw new Error("Шаблон не найден");
  }

  const clipCount = Math.max(1, Math.min(40, Math.round(input.clipCount)));
  const clipSeconds = Math.max(10, Math.min(90, Math.round(input.clipSeconds)));
  const startHour = Math.max(0, Math.min(23, Math.round(input.scheduleStartHour)));
  const endHour = Math.max(startHour + 1, Math.min(24, Math.round(input.scheduleEndHour)));
  const intervalMinutes = Math.max(1, Math.min(180, Math.round(input.scheduleIntervalMinutes)));
  const timeZone = input.timeZone || "Europe/Moscow";
  const schedule = buildSchedule({
    mode: input.scheduleMode,
    startHour,
    endHour,
    intervalMinutes,
    timeZone,
    clipCount,
    startAt: input.scheduleStartAt,
    endAt: input.scheduleEndAt,
    distribution: input.scheduleDistribution,
  });
  const movieTitle = (input.movieTitle || "VK фильм").replace(/\s+/g, " ").trim().slice(0, 90);
  const titlePrefix = `VK_RU:${movieTitle}`.slice(0, 100);

  return withDbRetry(() =>
    prisma.factoryJob.create({
      data: {
        sourceUrl: input.sourceUrl,
        sourceOriginalName: movieTitle,
        clipSeconds,
        titlePrefix,
        longVideoDescription: input.description?.trim() || null,
        game: "OTHER",
        templateId: input.templateId || null,
        platforms: [account.platform],
        status: "QUEUED",
        progressLabel: scheduleLabel(schedule, clipCount, clipSeconds),
        publishTiming: schedule ? "USA_SMART" : "NOW",
        scheduledAt: input.scheduledAt === undefined ? firstScheduledAt(schedule) : input.scheduledAt,
        cutMode: "MOVIE_SMART",
        smartStepSeconds: 60,
        smartCandidates: 160,
        smartMinGapSeconds: 600,
        recommendation: schedule ? JSON.stringify({ uploadSchedule: schedule }) : null,
        cancelRequested: false,
        targets: {
          create: {
            accountId: account.id,
            platform: account.platform,
            templateId: input.templateId || null,
            titlePrefix,
            maxClips: clipCount,
          },
        },
      },
      include: { targets: true },
    }),
  );
}
