import { NextResponse } from "next/server";

import { scanAllVkGroups } from "../../../../../../lib/factory/vk-super-upload";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await scanAllVkGroups({ limitPerGroup: 8 });

    return NextResponse.json({
      ...result,
      summary: {
        checked: result.checked,
        created: result.created,
        errors: result.errors.length,
        candidates: result.candidates.length,
      },
      message: `Проверено VK-групп: ${result.checked}. Кандидатов для выбора: ${result.candidates.length}.`,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не получилось проверить VK-группы",
      },
      { status: 500 },
    );
  }
}
