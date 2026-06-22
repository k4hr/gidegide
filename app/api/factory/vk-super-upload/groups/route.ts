import { NextResponse } from "next/server";
import { z } from "zod";

import {
  addVkGroup,
  buildVkDailyCandidates,
  listVkGroups,
  setVkGroupActive,
} from "../../../../../lib/factory/vk-super-upload";

export const runtime = "nodejs";

const postSchema = z.object({
  sourceUrl: z.string().min(3, "Вставь ссылку на VK-группу"),
  name: z.string().max(120).optional().nullable(),
  category: z.string().max(80).optional().nullable(),
});

const patchSchema = z.object({
  id: z.string().min(1),
  isActive: z.boolean(),
});

export async function GET() {
  try {
    const groups = await listVkGroups();
    const candidates = await buildVkDailyCandidates({ limit: 3 });

    return NextResponse.json({
      groups,
      candidates,
      summary: {
        groups: groups.length,
        active: groups.filter((group) => group.isActive).length,
        candidates: candidates.length,
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не получилось загрузить VK-группы",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = postSchema.parse(await request.json());
    const group = await addVkGroup(body);
    const candidates = await buildVkDailyCandidates({ limit: 3 });

    return NextResponse.json({
      group,
      candidates,
      message: `VK-группа сохранена: ${group.name}`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Некорректные данные" },
        { status: 400 },
      );
    }

    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не получилось добавить VK-группу",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = patchSchema.parse(await request.json());
    const group = await setVkGroupActive(body);
    const candidates = await buildVkDailyCandidates({ limit: 3 });

    return NextResponse.json({
      group,
      candidates,
      message: group.isActive ? "VK-группа включена" : "VK-группа выключена",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Некорректные данные" },
        { status: 400 },
      );
    }

    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не получилось обновить VK-группу",
      },
      { status: 500 },
    );
  }
}
