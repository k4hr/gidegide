import { NextResponse } from "next/server";
import { z } from "zod";

import { analyzeYoutubeSource } from "@/lib/factory/super-upload";

export const runtime = "nodejs";

const bodySchema = z.object({
  sourceUrl: z.string().min(3, "Вставь ссылку на YouTube-канал или видео"),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const result = await analyzeYoutubeSource({
      sourceUrl: body.sourceUrl,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: error.issues[0]?.message ?? "Некорректные данные",
        },
        {
          status: 400,
        },
      );
    }

    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не получилось проанализировать YouTube-канал",
      },
      {
        status: 500,
      },
    );
  }
}
