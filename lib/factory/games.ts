import type { FactoryGame } from "@prisma/client";

type HookCategory =
  | "ENDING"
  | "SURVIVAL"
  | "IMPOSSIBLE"
  | "FAIL"
  | "SUSPENSE"
  | "CHALLENGE"
  | "FUNNY"
  | "DIRECT";

type HookTemplate = {
  category: HookCategory;
  templates: string[];
};

export const GAME_OPTIONS: Array<{
  value: FactoryGame;
  label: string;
  titlePrefix: string;
  hashtags: string[];
}> = [
  {
    value: "ROBLOX",
    label: "Roblox",
    titlePrefix: "auto mix",
    hashtags: ["#roblox", "#robloxshorts", "#robloxobby", "#gaming", "#shorts"],
  },
  {
    value: "FORTNITE",
    label: "Fortnite",
    titlePrefix: "auto mix",
    hashtags: [
      "#fortnite",
      "#fortniteclips",
      "#gaming",
      "#shorts",
      "#battleroyale",
    ],
  },
  {
    value: "MINECRAFT",
    label: "Minecraft",
    titlePrefix: "auto mix",
    hashtags: [
      "#minecraft",
      "#minecraftclips",
      "#gaming",
      "#shorts",
      "#minecraftmemes",
    ],
  },
  {
    value: "BRAWL_STARS",
    label: "Brawl Stars",
    titlePrefix: "auto mix",
    hashtags: [
      "#brawlstars",
      "#brawlstarsclips",
      "#gaming",
      "#shorts",
      "#supercell",
    ],
  },
  {
    value: "DOTA2",
    label: "Dota 2",
    titlePrefix: "auto mix",
    hashtags: ["#dota2", "#dotaclips", "#gaming", "#shorts", "#moba"],
  },
  {
    value: "OTHER",
    label: "Other",
    titlePrefix: "auto mix",
    hashtags: ["#gaming", "#gamingclips", "#shorts", "#funny", "#clips"],
  },
];

const HOOK_MIX: Record<FactoryGame, HookTemplate[]> = {
  ROBLOX: [
    {
      category: "ENDING",
      templates: [
        "Wait for the ending",
        "Nobody expected this ending",
        "The ending changed everything",
        "The last second was insane",
        "This ending made no sense",
        "It all comes down to the end",
        "The final jump decided everything",
        "The ending is actually wild",
        "Watch the ending closely",
        "The last move saved the run",
      ],
    },
    {
      category: "SURVIVAL",
      templates: [
        "He should not have survived this",
        "How did he survive that",
        "He survived with one second left",
        "This save was way too lucky",
        "He almost lost everything here",
        "That survival was actually impossible",
        "He was one mistake away from losing",
        "This Roblox player got too lucky",
        "He somehow stayed alive",
        "That escape should not have worked",
      ],
    },
    {
      category: "IMPOSSIBLE",
      templates: [
        "This Roblox obby looked impossible",
        "This jump was way too hard",
        "This level should be illegal",
        "I would rage quit here",
        "This Roblox map is actually impossible",
        "This part breaks most players",
        "That obstacle was pure evil",
        "This obby got unfair fast",
        "This level was made to make people quit",
        "There is no way this is fair",
      ],
    },
    {
      category: "FAIL",
      templates: [
        "The fail at the end hurts",
        "One mistake ruined everything",
        "He lost it at the worst moment",
        "This was painful to watch",
        "He threw the easiest win",
        "That fall was brutal",
        "This Roblox fail was personal",
        "He panicked at the worst time",
        "The run ended in the dumbest way",
        "This mistake cost him everything",
      ],
    },
    {
      category: "SUSPENSE",
      templates: [
        "There is no way he makes this",
        "I thought he was done",
        "This got way too close",
        "Watch what happens next",
        "I did not expect that move",
        "This was closer than it should be",
        "He almost sold the whole run",
        "This moment got stressful fast",
        "The timing here was insane",
        "This Roblox run had me nervous",
      ],
    },
    {
      category: "CHALLENGE",
      templates: [
        "Only Roblox pros can beat this",
        "Most players fail this part",
        "Can you survive this Roblox obby",
        "Try not to blink here",
        "This level tests your patience",
        "Only one percent beat this part",
        "This is where most people quit",
        "Would you make this jump",
        "This Roblox challenge is too stressful",
        "This part separates pros from beginners",
      ],
    },
    {
      category: "FUNNY",
      templates: [
        "Roblox physics went crazy here",
        "Bro forgot how to jump",
        "This was the dumbest way to lose",
        "He panicked so hard",
        "This Roblox moment was too random",
        "That was not supposed to happen",
        "Roblox chose violence today",
        "This clip got weird fast",
        "The timing was accidentally perfect",
        "This Roblox moment is pure chaos",
      ],
    },
    {
      category: "DIRECT",
      templates: [
        "Roblox obby got intense",
        "Roblox parkour got too close",
        "Roblox escape challenge went wrong",
        "Roblox lava challenge got stressful",
        "Roblox tower run got insane",
        "Roblox gameplay turned into chaos",
        "Roblox obby moments that make no sense",
        "Roblox challenge with a wild ending",
        "Roblox parkour almost ended badly",
        "Roblox run got harder every second",
      ],
    },
  ],

  FORTNITE: [
    {
      category: "ENDING",
      templates: [
        "Wait for the final fight",
        "Nobody expected this ending",
        "The last shot changed everything",
        "This ending was too close",
        "The final move was perfect",
      ],
    },
    {
      category: "SURVIVAL",
      templates: [
        "He should not have survived this",
        "How did he live through that",
        "This save was unreal",
        "He survived with no time left",
        "That escape was way too clean",
      ],
    },
    {
      category: "IMPOSSIBLE",
      templates: [
        "This fight looked impossible",
        "This clutch should not happen",
        "There is no way this works",
        "This Fortnite play was impossible",
        "That recovery was unreal",
      ],
    },
    {
      category: "FAIL",
      templates: [
        "One mistake ruined everything",
        "This fail hurt to watch",
        "He lost it at the worst moment",
        "This was painful",
        "That was the worst timing",
      ],
    },
    {
      category: "SUSPENSE",
      templates: [
        "This got way too close",
        "I thought he was done",
        "Watch what happens next",
        "The timing was insane",
        "This fight got stressful fast",
      ],
    },
    {
      category: "CHALLENGE",
      templates: [
        "Only Fortnite pros win this",
        "Most players lose this fight",
        "Could you clutch this",
        "This is where most people panic",
        "This endgame was too intense",
      ],
    },
    {
      category: "FUNNY",
      templates: [
        "Fortnite physics went crazy",
        "Bro panicked instantly",
        "This was not supposed to happen",
        "The timing was too funny",
        "This Fortnite moment was pure chaos",
      ],
    },
    {
      category: "DIRECT",
      templates: [
        "Fortnite endgame got intense",
        "Fortnite clutch moment",
        "Fortnite fight went crazy",
        "Fortnite gameplay turned into chaos",
        "Fortnite clip with a wild ending",
      ],
    },
  ],

  MINECRAFT: [
    {
      category: "ENDING",
      templates: [
        "Wait for the ending",
        "Nobody expected this ending",
        "The ending changed everything",
        "The last second was insane",
        "This Minecraft ending made no sense",
      ],
    },
    {
      category: "SURVIVAL",
      templates: [
        "He should not have survived this",
        "How did he survive that",
        "He survived with one heart",
        "This save was way too lucky",
        "That escape should not have worked",
      ],
    },
    {
      category: "IMPOSSIBLE",
      templates: [
        "This Minecraft challenge looked impossible",
        "This jump was way too hard",
        "There is no way this is fair",
        "This part breaks most players",
        "This level was made to make people quit",
      ],
    },
    {
      category: "FAIL",
      templates: [
        "One mistake ruined everything",
        "The fail at the end hurts",
        "He lost it at the worst moment",
        "This was painful to watch",
        "That fall was brutal",
      ],
    },
    {
      category: "SUSPENSE",
      templates: [
        "There is no way he makes this",
        "I thought he was done",
        "This got way too close",
        "Watch what happens next",
        "This moment got stressful fast",
      ],
    },
    {
      category: "CHALLENGE",
      templates: [
        "Only Minecraft pros can beat this",
        "Most players fail this part",
        "Could you survive this",
        "This challenge tests your patience",
        "This is where most people quit",
      ],
    },
    {
      category: "FUNNY",
      templates: [
        "Minecraft physics went crazy",
        "Bro forgot how to jump",
        "This was the dumbest way to lose",
        "This Minecraft moment was too random",
        "That was not supposed to happen",
      ],
    },
    {
      category: "DIRECT",
      templates: [
        "Minecraft challenge got intense",
        "Minecraft parkour got too close",
        "Minecraft escape went wrong",
        "Minecraft gameplay turned into chaos",
        "Minecraft clip with a wild ending",
      ],
    },
  ],

  BRAWL_STARS: [
    {
      category: "ENDING",
      templates: [
        "Wait for the final fight",
        "Nobody expected this ending",
        "The last second changed everything",
        "This ending was too close",
        "The final move was perfect",
      ],
    },
    {
      category: "SURVIVAL",
      templates: [
        "He should not have survived this",
        "How did he survive that",
        "This save was unreal",
        "He survived with no health",
        "That escape was way too clean",
      ],
    },
    {
      category: "IMPOSSIBLE",
      templates: [
        "This fight looked impossible",
        "This clutch should not happen",
        "There is no way this works",
        "This Brawl Stars play was impossible",
        "That recovery was unreal",
      ],
    },
    {
      category: "FAIL",
      templates: [
        "One mistake ruined everything",
        "This fail hurt to watch",
        "He lost it at the worst moment",
        "This was painful",
        "That was the worst timing",
      ],
    },
    {
      category: "SUSPENSE",
      templates: [
        "This got way too close",
        "I thought he was done",
        "Watch what happens next",
        "The timing was insane",
        "This fight got stressful fast",
      ],
    },
    {
      category: "CHALLENGE",
      templates: [
        "Only Brawl Stars pros win this",
        "Most players lose this fight",
        "Could you clutch this",
        "This is where most people panic",
        "This match was too intense",
      ],
    },
    {
      category: "FUNNY",
      templates: [
        "Brawl Stars got chaotic",
        "Bro panicked instantly",
        "This was not supposed to happen",
        "The timing was too funny",
        "This Brawl Stars moment was pure chaos",
      ],
    },
    {
      category: "DIRECT",
      templates: [
        "Brawl Stars match got intense",
        "Brawl Stars clutch moment",
        "Brawl Stars fight went crazy",
        "Brawl Stars gameplay turned into chaos",
        "Brawl Stars clip with a wild ending",
      ],
    },
  ],

  DOTA2: [
    {
      category: "ENDING",
      templates: [
        "Wait for the final fight",
        "Nobody expected this ending",
        "The last spell changed everything",
        "This ending was too close",
        "The final move was perfect",
      ],
    },
    {
      category: "SURVIVAL",
      templates: [
        "He should not have survived this",
        "How did he live through that",
        "This save was unreal",
        "He survived with no HP",
        "That escape was way too clean",
      ],
    },
    {
      category: "IMPOSSIBLE",
      templates: [
        "This fight looked impossible",
        "This play should not work",
        "There is no way this works",
        "This Dota play was impossible",
        "That recovery was unreal",
      ],
    },
    {
      category: "FAIL",
      templates: [
        "One mistake ruined everything",
        "This fail hurt to watch",
        "He lost it at the worst moment",
        "This was painful",
        "That was the worst timing",
      ],
    },
    {
      category: "SUSPENSE",
      templates: [
        "This got way too close",
        "I thought he was done",
        "Watch what happens next",
        "The timing was insane",
        "This fight got stressful fast",
      ],
    },
    {
      category: "CHALLENGE",
      templates: [
        "Only Dota players understand this",
        "Most players lose this fight",
        "Could you survive this",
        "This is where most people panic",
        "This teamfight was too intense",
      ],
    },
    {
      category: "FUNNY",
      templates: [
        "Dota chaos in one clip",
        "Bro panicked instantly",
        "This was not supposed to happen",
        "The timing was too funny",
        "This Dota moment was pure chaos",
      ],
    },
    {
      category: "DIRECT",
      templates: [
        "Dota fight got intense",
        "Dota clutch moment",
        "Dota teamfight went crazy",
        "Dota gameplay turned into chaos",
        "Dota clip with a wild ending",
      ],
    },
  ],

  OTHER: [
    {
      category: "ENDING",
      templates: [
        "Wait for the ending",
        "Nobody expected this ending",
        "The ending changed everything",
        "The last second was insane",
        "This ending made no sense",
      ],
    },
    {
      category: "SURVIVAL",
      templates: [
        "He should not have survived this",
        "How did he survive that",
        "This save was way too lucky",
        "He almost lost everything here",
        "That escape should not have worked",
      ],
    },
    {
      category: "IMPOSSIBLE",
      templates: [
        "This looked impossible",
        "This was way too hard",
        "This level should be illegal",
        "I would rage quit here",
        "There is no way this is fair",
      ],
    },
    {
      category: "FAIL",
      templates: [
        "The fail at the end hurts",
        "One mistake ruined everything",
        "He lost it at the worst moment",
        "This was painful to watch",
        "That fall was brutal",
      ],
    },
    {
      category: "SUSPENSE",
      templates: [
        "There is no way he makes this",
        "I thought he was done",
        "This got way too close",
        "Watch what happens next",
        "I did not expect that move",
      ],
    },
    {
      category: "CHALLENGE",
      templates: [
        "Only pros can beat this",
        "Most players fail this part",
        "Could you survive this",
        "Try not to blink here",
        "This challenge is too stressful",
      ],
    },
    {
      category: "FUNNY",
      templates: [
        "The physics went crazy here",
        "Bro forgot how to play",
        "This was the dumbest way to lose",
        "He panicked so hard",
        "This moment was pure chaos",
      ],
    },
    {
      category: "DIRECT",
      templates: [
        "Gaming moment got intense",
        "Gameplay turned into chaos",
        "Challenge with a wild ending",
        "This clip got stressful",
        "Gaming clip with a crazy ending",
      ],
    },
  ],
};

const TITLE_SUFFIXES = [
  "",
  "",
  "",
  " #shorts",
  " #gaming",
  " #roblox",
  " #robloxshorts",
];

function pickRandom<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function normalizeTitle(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([?!.,])/g, "$1")
    .trim()
    .slice(0, 95);
}

function getHookCategoriesFromPrefix(value: string | null | undefined): HookCategory[] | null {
  const normalized = (value ?? "").trim().toUpperCase();

  if (!normalized) return null;

  if (normalized.startsWith("HOOK:")) {
    const categories = normalized
      .replace(/^HOOK:/, "")
      .split(/[,|_+\s]+/)
      .filter(Boolean) as HookCategory[];

    return categories.length > 0 ? categories : null;
  }

  if (normalized === "IMPOSSIBLE_SUSPENSE" || normalized === "HOOK_IMPOSSIBLE_SUSPENSE") {
    return ["IMPOSSIBLE", "SUSPENSE"];
  }

  if (normalized === "SURVIVAL_ENDING" || normalized === "HOOK_SURVIVAL_ENDING") {
    return ["SURVIVAL", "ENDING"];
  }

  if (normalized === "FUNNY_FAIL" || normalized === "HOOK_FUNNY_FAIL") {
    return ["FUNNY", "FAIL"];
  }

  if (normalized === "SUSPENSE_ENDING" || normalized === "HOOK_SUSPENSE_ENDING") {
    return ["SUSPENSE", "ENDING"];
  }

  if (normalized === "ENDING_SURVIVAL_IMPOSSIBLE" || normalized === "HOOK_ENDING_SURVIVAL_IMPOSSIBLE") {
    return ["ENDING", "SURVIVAL", "IMPOSSIBLE"];
  }

  if (normalized === "SURVIVAL_SUSPENSE" || normalized === "HOOK_SURVIVAL_SUSPENSE") {
    return ["SURVIVAL", "SUSPENSE"];
  }

  if (normalized === "AUTO_BEST_MIX") {
    return null;
  }

  return null;
}

function isAutoMixTitlePrefix(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();

  return (
    normalized.length === 0 ||
    normalized === "auto" ||
    normalized === "auto mix" ||
    normalized === "automix" ||
    normalized === "random" ||
    normalized === "mix" ||
    normalized === "auto_best_mix" ||
    normalized.startsWith("hook:") ||
    normalized.startsWith("hook_") ||
    normalized.includes("_survival") ||
    normalized.includes("_suspense") ||
    normalized.includes("_impossible") ||
    normalized.includes("_ending") ||
    normalized.includes("_fail") ||
    normalized.includes("_funny")
  );
}

function buildManualTitle(input: {
  titlePrefix: string;
  game: FactoryGame;
  index: number;
}) {
  const titleNumber = input.index > 1 ? ` #${input.index}` : "";

  return normalizeTitle(`${input.titlePrefix}${titleNumber}`);
}

function buildAutoMixTitle(input: {
  game: FactoryGame;
  index: number;
  titlePrefix?: string | null;
}) {
  const hookGroups = HOOK_MIX[input.game] ?? HOOK_MIX.OTHER;
  const preferredCategories = getHookCategoriesFromPrefix(input.titlePrefix);
  const filteredGroups = preferredCategories
    ? hookGroups.filter((group) => preferredCategories.includes(group.category))
    : hookGroups;
  const group = pickRandom(filteredGroups.length > 0 ? filteredGroups : hookGroups);
  const template = pickRandom(group.templates);
  const suffix = input.game === "ROBLOX" ? pickRandom(TITLE_SUFFIXES) : "";

  return normalizeTitle(`${template}${suffix}`);
}

export function getGameMeta(game: FactoryGame) {
  return (
    GAME_OPTIONS.find((option) => option.value === game) ??
    GAME_OPTIONS.find((option) => option.value === "OTHER")!
  );
}

export function buildFactoryTitle(input: {
  game: FactoryGame;
  titlePrefix: string;
  index: number;
}) {
  if (isAutoMixTitlePrefix(input.titlePrefix)) {
    return buildAutoMixTitle({
      game: input.game,
      index: input.index,
      titlePrefix: input.titlePrefix,
    });
  }

  return buildManualTitle({
    game: input.game,
    titlePrefix: input.titlePrefix,
    index: input.index,
  });
}

export function buildFactoryDescription(input: {
  game: FactoryGame;
  title: string;
}) {
  const meta = getGameMeta(input.game);
  const hashtags = meta.hashtags.join(" ");

  return `${input.title}\n\n${hashtags}`;
}

/**
 * Старый wrapper для worker/factory-worker.ts.
 *
 * Поддерживает новый формат:
 * buildClipTitle({ game, titlePrefix, index })
 *
 * И старый формат:
 * buildClipTitle({ game, clipIndex, customPrefix, seedHint })
 */
export function buildClipTitle(input: {
  game: FactoryGame;
  titlePrefix?: string;
  index?: number;
  clipIndex?: number;
  customPrefix?: string | null;
  seedHint?: string;
}) {
  const titlePrefix = input.titlePrefix ?? input.customPrefix ?? "auto mix";
  const index = input.index ?? input.clipIndex ?? 1;

  return buildFactoryTitle({
    game: input.game,
    titlePrefix,
    index,
  });
}

/**
 * Старый wrapper для worker/factory-worker.ts.
 *
 * Поддерживает:
 * buildClipDescription({ game, title })
 * buildClipDescription({ game, clipTitle })
 * buildClipDescription({ game, customPrefix })
 */
export function buildClipDescription(input: {
  game: FactoryGame;
  title?: string;
  clipTitle?: string;
  customPrefix?: string | null;
  titlePrefix?: string | null;
}) {
  const title =
    input.title ??
    input.clipTitle ??
    input.customPrefix ??
    input.titlePrefix ??
    getGameMeta(input.game).titlePrefix;

  return buildFactoryDescription({
    game: input.game,
    title,
  });
}
