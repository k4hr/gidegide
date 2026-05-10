import { NextResponse } from "next/server";
import { google } from "googleapis";

import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/factory/db-retry";
import { getYoutubeOAuthClient } from "@/lib/factory/youtube-analytics";

export const runtime = "nodejs";

type DeleteVideoRequest = {
  publishId?: string;
};

function getDeleteScopeErrorMessage() {
  return [
    "Не хватает YouTube OAuth scope для удаления видео.",
    "Добавь в Google Cloud scope https://www.googleapis.com/auth/youtube.force-ssl или https://www.googleapis.com/auth/youtube,",
    "потом удали YouTube-аккаунт на /factory/accounts и подключи его заново.",
  ].join(" ");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DeleteVideoRequest;
    const publishId = body.publishId?.trim();

    if (!publishId) {
      return NextResponse.json(
        {
          error: "publishId обязателен",
        },
        {
          status: 400,
        },
      );
    }

    const publish = await withDbRetry(() =>
      prisma.factoryPublish.findUnique({
        where: {
          id: publishId,
        },
        include: {
          account: true,
          analysis: true,
        },
      }),
    );

    if (!publish) {
      return NextResponse.json(
        {
          error: "Публикация не найдена",
        },
        {
          status: 404,
        },
      );
    }

    if (publish.platform !== "YOUTUBE") {
      return NextResponse.json(
        {
          error: "Удалять с канала можно только YouTube-публикации",
        },
        {
          status: 400,
        },
      );
    }

    if (!publish.platformPostId) {
      return NextResponse.json(
        {
          error: "У публикации нет YouTube videoId",
        },
        {
          status: 400,
        },
      );
    }

    if (!publish.account) {
      return NextResponse.json(
        {
          error: "У публикации нет привязанного YouTube-аккаунта",
        },
        {
          status: 400,
        },
      );
    }

    const oauth2Client = getYoutubeOAuthClient(publish.account);
    const youtube = google.youtube({
      version: "v3",
      auth: oauth2Client,
    });

    try {
      await youtube.videos.delete({
        id: publish.platformPostId,
      });
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : "YouTube не дал удалить видео";

      const normalized = message.toLowerCase();

      if (
        normalized.includes("insufficient") ||
        normalized.includes("permission") ||
        normalized.includes("forbidden") ||
        normalized.includes("scope")
      ) {
        return NextResponse.json(
          {
            error: getDeleteScopeErrorMessage(),
            details: message,
          },
          {
            status: 403,
          },
        );
      }

      return NextResponse.json(
        {
          error: "YouTube не дал удалить видео",
          details: message,
        },
        {
          status: 502,
        },
      );
    }

    await withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        await tx.factoryVideoMetric.deleteMany({
          where: {
            publishId: publish.id,
          },
        });

        await tx.factoryVideoAnalysis.deleteMany({
          where: {
            publishId: publish.id,
          },
        });

        await tx.factoryPublish.update({
          where: {
            id: publish.id,
          },
          data: {
            status: "CANCELED",
            error: "Deleted from YouTube channel from analytics page",
          },
        });
      }),
    );

    return NextResponse.json({
      ok: true,
      deleted: true,
      publishId: publish.id,
      videoId: publish.platformPostId,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не получилось удалить видео с канала",
      },
      {
        status: 500,
      },
    );
  }
}
