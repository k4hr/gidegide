import type { FactoryGame } from "@prisma/client";

export const GAME_OPTIONS: Array<{
  value: FactoryGame;
  label: string;
  titlePrefix: string;
  hashtags: string[];
}> = [
  {
    value: "ROBLOX",
    label: "Roblox",
    titlePrefix: "crazy roblox moments",
    hashtags: ["#roblox", "#robloxclips", "#gaming", "#shorts", "#funny"],
  },
  {
    value: "FORTNITE",
    label: "Fortnite",
    titlePrefix: "fortnite highlights",
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
    titlePrefix: "minecraft moments",
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
    titlePrefix: "brawl stars clips",
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
    titlePrefix: "dota 2 highlights",
    hashtags: ["#dota2", "#dotaclips", "#gaming", "#shorts", "#moba"],
  },
  {
    value: "OTHER",
    label: "Other",
    titlePrefix: "gaming highlights",
    hashtags: ["#gaming", "#gamingclips", "#shorts", "#funny", "#reaction"],
  },
];

const GAME_TITLE_VARIANTS: Record<FactoryGame, string[]> = {
  ROBLOX: [
    "This Roblox Moment Was Insane",
    "Roblox Went Completely Wrong",
    "This Roblox Clip Made No Sense",
    "The Wildest Roblox Moment Today",
    "This Roblox Challenge Got Out Of Hand",
    "Roblox Almost Ended In Disaster",
    "This Roblox Timing Was Perfect",
    "The Weirdest Roblox Moment Today",
    "Roblox Got Crazy Fast",
    "This Roblox Play Should Not Have Worked",
    "That Roblox Ending Was Brutal",
    "This Roblox Escape Was Unbelievable",
    "Roblox Chaos In Under A Minute",
    "This Roblox Fail Was Painful",
    "The Cleanest Roblox Moment Today",
    "This Roblox Round Turned Instantly",
    "Nobody Expected This Roblox Ending",
    "This Roblox Obby Was Actually Impossible",
    "Roblox Physics Went Too Far",
    "This Roblox Player Got So Lucky",
    "The Most Random Roblox Clip Today",
    "This Roblox Map Was Pure Chaos",
    "That Roblox Jump Was Way Too Close",
    "This Roblox Moment Hit Different",
    "Roblox Players Are Built Different",
    "This Roblox Game Went Off The Rails",
    "The Funniest Roblox Fail Today",
    "This Roblox Run Got Worse Every Second",
    "That Roblox Trap Was Evil",
    "This Roblox Clip Is Pure Panic",
    "Roblox Obby Moments That Make No Sense",
    "This Roblox Shortcut Was Too Clean",
  ],

  FORTNITE: [
    "This Fortnite Moment Was Unreal",
    "Fortnite Got Wild Instantly",
    "That Fortnite Ending Was Insane",
    "This Fortnite Clutch Came Out Of Nowhere",
    "Fortnite Almost Went Very Wrong",
    "This Fortnite Fight Got Brutal",
    "That Fortnite Push Actually Worked",
    "Fortnite Chaos In One Short Clip",
    "This Fortnite Play Changed Everything",
    "The Cleanest Fortnite Moment Today",
    "This Fortnite Fail Hurt To Watch",
    "Fortnite Turned Around In Seconds",
    "That Fortnite Edit Was Too Fast",
    "This Fortnite Clip Makes No Sense",
    "The Craziest Fortnite Timing",
    "This Fortnite Recovery Was Impossible",
    "Nobody Expected This Fortnite Play",
    "This Fortnite Fight Was Too Close",
    "Fortnite Players Are Built Different",
    "This Fortnite Ending Was Perfect",
    "That Fortnite Shot Was Unreal",
    "This Fortnite Clip Got Out Of Control",
    "The Wildest Fortnite Moment Today",
    "This Fortnite Round Went Completely Wrong",
    "Fortnite Highlights That Hit Different",
    "That Fortnite Escape Was Too Clean",
    "This Fortnite Moment Was Pure Panic",
    "Fortnite Chaos Got Worse Every Second",
    "This Fortnite Player Got So Lucky",
    "The Most Random Fortnite Clip Today",
    "This Fortnite Play Should Not Have Worked",
    "That Fortnite Finish Was Brutal",
  ],

  MINECRAFT: [
    "This Minecraft Moment Was Cursed",
    "Minecraft Went Wrong Fast",
    "That Minecraft Save Was Unbelievable",
    "This Minecraft Clip Was Too Close",
    "Minecraft Chaos In A Few Seconds",
    "This Minecraft Move Actually Worked",
    "That Minecraft Ending Was Perfect",
    "Minecraft Almost Became A Disaster",
    "This Minecraft Build Failed Badly",
    "The Weirdest Minecraft Moment Today",
    "This Minecraft Escape Was Insane",
    "Minecraft Turned Around Instantly",
    "That Minecraft Trap Was Brutal",
    "This Minecraft Play Was Too Smart",
    "Minecraft Got Chaotic Fast",
    "This Minecraft Recovery Was Impossible",
    "Nobody Expected This Minecraft Ending",
    "This Minecraft Clip Made No Sense",
    "Minecraft Players Are Too Creative",
    "This Minecraft Moment Hit Different",
    "That Minecraft Jump Was Way Too Close",
    "This Minecraft World Was Pure Chaos",
    "The Funniest Minecraft Fail Today",
    "This Minecraft Run Got Worse Every Second",
    "Minecraft But Everything Went Wrong",
    "That Minecraft Shortcut Was Too Clean",
    "This Minecraft Player Got So Lucky",
    "The Most Random Minecraft Clip Today",
    "This Minecraft Trap Was Actually Genius",
    "Minecraft Moments That Make No Sense",
    "This Minecraft Ending Was Brutal",
    "That Minecraft Escape Should Not Work",
  ],

  BRAWL_STARS: [
    "This Brawl Stars Clip Was Crazy",
    "Brawl Stars Turned Instantly",
    "That Brawl Stars Finish Was Brutal",
    "This Brawl Stars Push Was Perfect",
    "Brawl Stars Chaos In One Minute",
    "This Brawl Stars Comeback Was Insane",
    "That Brawl Stars Timing Was Unreal",
    "This Brawl Stars Fail Hurt",
    "Brawl Stars Went Wrong Fast",
    "This Brawl Stars Round Made No Sense",
    "The Cleanest Brawl Stars Moment Today",
    "That Brawl Stars Clutch Was Wild",
    "This Brawl Stars Play Changed Everything",
    "Brawl Stars Got Crazy At The End",
    "This Brawl Stars Escape Should Not Work",
    "That Brawl Stars Ending Was Too Close",
    "Nobody Expected This Brawl Stars Play",
    "This Brawl Stars Match Was Pure Panic",
    "Brawl Stars Players Are Built Different",
    "This Brawl Stars Clip Hit Different",
    "That Brawl Stars Move Was Too Smart",
    "This Brawl Stars Fight Got Brutal",
    "The Wildest Brawl Stars Clip Today",
    "Brawl Stars Chaos Got Worse Every Second",
    "This Brawl Stars Player Got So Lucky",
    "The Most Random Brawl Stars Moment Today",
    "This Brawl Stars Round Went Completely Wrong",
    "That Brawl Stars Recovery Was Impossible",
    "This Brawl Stars Finish Was Perfect",
    "Brawl Stars Highlights That Hit Different",
    "This Brawl Stars Clip Is Pure Chaos",
    "That Brawl Stars Push Should Not Work",
  ],

  DOTA2: [
    "This Dota 2 Fight Was Insane",
    "Dota 2 Turned Around Instantly",
    "That Dota 2 Timing Was Perfect",
    "This Dota 2 Clip Got Brutal Fast",
    "Dota 2 Chaos In A Short Clip",
    "This Dota 2 Save Was Unbelievable",
    "That Dota 2 Fight Made No Sense",
    "This Dota 2 Comeback Was Wild",
    "Dota 2 Almost Ended In Disaster",
    "That Dota 2 Play Was Too Clean",
    "This Dota 2 Fail Hurt To Watch",
    "Dota 2 Got Out Of Control Fast",
    "That Dota 2 Ending Was Crazy",
    "This Dota 2 Escape Was Impossible",
    "The Cleanest Dota 2 Moment Today",
    "This Dota 2 Fight Changed Everything",
    "Nobody Expected This Dota 2 Play",
    "This Dota 2 Clip Was Pure Panic",
    "Dota 2 Players Are Built Different",
    "This Dota 2 Moment Hit Different",
    "That Dota 2 Move Was Too Smart",
    "This Dota 2 Fight Went Completely Wrong",
    "The Wildest Dota 2 Clip Today",
    "Dota 2 Chaos Got Worse Every Second",
    "This Dota 2 Player Got So Lucky",
    "The Most Random Dota 2 Moment Today",
    "This Dota 2 Recovery Was Unreal",
    "That Dota 2 Save Should Not Work",
    "This Dota 2 Ending Was Brutal",
    "Dota 2 Highlights That Hit Different",
    "This Dota 2 Clip Is Pure Chaos",
    "That Dota 2 Fight Was Way Too Close",
  ],

  OTHER: [
    "This Gaming Clip Was Insane",
    "That Ending Was Wild",
    "This Moment Made No Sense",
    "Gaming Chaos In One Short Clip",
    "This Play Changed Everything",
    "That Timing Was Unreal",
    "This Clip Went Wrong Fast",
    "The Cleanest Moment Today",
    "This Comeback Was Unbelievable",
    "That Finish Was Brutal",
    "This Play Should Not Have Worked",
    "Gaming Got Crazy Instantly",
    "This Clip Was Too Close",
    "That Recovery Was Impossible",
    "This Moment Turned Around Fast",
    "One Of The Wildest Gaming Clips Today",
    "Nobody Expected This Ending",
    "This Clip Was Pure Panic",
    "Gaming Moments That Make No Sense",
    "This Player Got So Lucky",
    "The Most Random Gaming Clip Today",
    "That Move Was Too Smart",
    "This Round Went Completely Wrong",
    "The Funniest Gaming Fail Today",
    "This Moment Hit Different",
    "Gaming Chaos Got Worse Every Second",
    "That Escape Should Not Work",
    "This Clip Got Out Of Control",
    "The Weirdest Gaming Moment Today",
    "This Ending Was Perfect",
  ],
};

const TOPIC_TITLE_SUFFIXES: Record<FactoryGame, string[]> = {
  ROBLOX: [
    "Went Completely Wrong",
    "Was Pure Chaos",
    "Got Wild Instantly",
    "Made No Sense",
    "Had The Craziest Ending",
    "Was Way Too Close",
    "Turned Into Disaster",
    "Was Actually Impossible",
    "Ended Perfectly",
    "Got Worse Every Second",
    "Was Too Funny",
    "Hit Different",
    "Should Not Have Worked",
    "Was Brutal",
    "Was Unbelievable",
    "Was Pure Panic",
  ],

  FORTNITE: [
    "Went Completely Wrong",
    "Was Pure Chaos",
    "Got Wild Instantly",
    "Had The Craziest Ending",
    "Was Way Too Close",
    "Turned Into Disaster",
    "Ended Perfectly",
    "Was Too Clean",
    "Got Worse Every Second",
    "Was Unreal",
    "Hit Different",
    "Should Not Have Worked",
    "Was Brutal",
    "Changed Everything",
    "Was Pure Panic",
    "Came Out Of Nowhere",
  ],

  MINECRAFT: [
    "Went Completely Wrong",
    "Was Pure Chaos",
    "Got Cursed Instantly",
    "Made No Sense",
    "Had The Craziest Ending",
    "Was Way Too Close",
    "Turned Into Disaster",
    "Was Actually Impossible",
    "Ended Perfectly",
    "Got Worse Every Second",
    "Was Too Smart",
    "Hit Different",
    "Should Not Have Worked",
    "Was Brutal",
    "Was Unbelievable",
    "Was Pure Panic",
  ],

  BRAWL_STARS: [
    "Went Completely Wrong",
    "Was Pure Chaos",
    "Got Wild Instantly",
    "Made No Sense",
    "Had The Craziest Ending",
    "Was Way Too Close",
    "Turned Into Disaster",
    "Ended Perfectly",
    "Was Too Clean",
    "Got Worse Every Second",
    "Was Brutal",
    "Hit Different",
    "Should Not Have Worked",
    "Changed Everything",
    "Was Unbelievable",
    "Was Pure Panic",
  ],

  DOTA2: [
    "Went Completely Wrong",
    "Was Pure Chaos",
    "Got Wild Instantly",
    "Made No Sense",
    "Had The Craziest Ending",
    "Was Way Too Close",
    "Turned Into Disaster",
    "Ended Perfectly",
    "Was Too Clean",
    "Got Worse Every Second",
    "Was Brutal",
    "Hit Different",
    "Should Not Have Worked",
    "Changed Everything",
    "Was Unbelievable",
    "Was Pure Panic",
  ],

  OTHER: [
    "Went Completely Wrong",
    "Was Pure Chaos",
    "Got Wild Instantly",
    "Made No Sense",
    "Had The Craziest Ending",
    "Was Way Too Close",
    "Turned Into Disaster",
    "Ended Perfectly",
    "Was Too Clean",
    "Got Worse Every Second",
    "Was Brutal",
    "Hit Different",
    "Should Not Have Worked",
    "Changed Everything",
    "Was Unbelievable",
    "Was Pure Panic",
  ],
};

const GENERIC_WATCHER_PREFIXES = [
  "lana watches",
  "mia watches",
  "amelia watches",
  "ember watches",
  "lana watch",
  "mia watch",
  "amelia watch",
  "ember watch",
  "watching",
  "reacts to",
  "react to",
  "reaction to",
  "reaction",
  "reacts",
];

const FORBIDDEN_TITLE_WORDS = [
  "lana",
  "mia",
  "amelia",
  "ember",
  "girl",
  "girls",
  "woman",
  "women",
  "watch",
  "watches",
  "watching",
  "reacts",
  "react",
  "reaction",
];

export function getGameMeta(game: FactoryGame) {
  return GAME_OPTIONS.find((option) => option.value === game) ?? GAME_OPTIONS[5];
}

function createSeed(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function pickVariant<T>(items: T[], seed: number) {
  return items[seed % items.length];
}

function normalizeSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function stripForbiddenTitleWords(value: string) {
  const parts = value
    .split(/\s+/)
    .filter((part) => {
      const normalized = part
        .toLowerCase()
        .replace(/[^a-z0-9а-яё_-]/gi, "");

      return !FORBIDDEN_TITLE_WORDS.includes(normalized);
    });

  return normalizeSpaces(parts.join(" "));
}

function normalizeCustomTheme(value?: string | null) {
  const clean = normalizeSpaces(value ?? "");

  if (!clean) {
    return null;
  }

  const normalized = clean.toLowerCase();

  if (GENERIC_WATCHER_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return null;
  }

  const withoutForbiddenWords = stripForbiddenTitleWords(clean);

  if (!withoutForbiddenWords) {
    return null;
  }

  return withoutForbiddenWords.slice(0, 42);
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .map((part) => {
      const lower = part.toLowerCase();

      if (lower.length <= 2) {
        return lower;
      }

      return lower.slice(0, 1).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function hasThemeMeaning(value: string) {
  return /[a-zа-яё0-9]/i.test(value);
}

function buildThemeBasedTitle(input: {
  game: FactoryGame;
  clipIndex: number;
  customPrefix?: string | null;
  seedHint?: string | number | null;
}) {
  const customTheme = normalizeCustomTheme(input.customPrefix);

  if (!customTheme || !hasThemeMeaning(customTheme)) {
    return null;
  }

  const suffixes = TOPIC_TITLE_SUFFIXES[input.game] ?? TOPIC_TITLE_SUFFIXES.OTHER;

  const seed = createSeed(
    [
      "theme-title",
      input.game,
      input.clipIndex,
      input.seedHint ?? "",
      customTheme,
    ]
      .join(":")
      .toLowerCase(),
  );

  const suffix = pickVariant(suffixes, seed);
  const theme = toTitleCase(customTheme);

  return `${theme} ${suffix}`;
}

export function buildClipTitle(input: {
  game: FactoryGame;
  clipIndex: number;
  customPrefix?: string | null;
  seedHint?: string | number | null;
}) {
  const themeTitle = buildThemeBasedTitle(input);

  if (themeTitle) {
    return themeTitle.slice(0, 95);
  }

  const variants = GAME_TITLE_VARIANTS[input.game] ?? GAME_TITLE_VARIANTS.OTHER;

  const seed = createSeed(
    [
      "variant-title",
      input.game,
      input.clipIndex,
      input.seedHint ?? "",
      input.customPrefix ?? "",
    ]
      .join(":")
      .toLowerCase(),
  );

  return pickVariant(variants, seed).slice(0, 95);
}

export function buildClipDescription(input: {
  game: FactoryGame;
  customPrefix?: string | null;
}) {
  const meta = getGameMeta(input.game);
  const customTheme = normalizeCustomTheme(input.customPrefix);

  return [
    customTheme
      ? `${meta.label} short gaming clip. Theme: ${customTheme}.`
      : `${meta.label} short gaming clip.`,
    "",
    meta.hashtags.join(" "),
  ].join("\n");
}
