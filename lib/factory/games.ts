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
    "This Roblox run was insane",
    "Roblox went completely wrong",
    "This Roblox clip made no sense",
    "One of the wildest Roblox moments",
    "This Roblox challenge got out of hand",
    "Roblox almost ended in disaster",
    "This Roblox timing was perfect",
    "The weirdest Roblox moment today",
    "Roblox got crazy fast",
    "This Roblox play should not have worked",
    "That Roblox ending was brutal",
    "This Roblox escape was unbelievable",
    "Roblox chaos in under a minute",
    "This Roblox fail was painful",
    "The cleanest Roblox moment today",
    "This Roblox round turned instantly",
  ],
  FORTNITE: [
    "This Fortnite moment was unreal",
    "Fortnite got wild instantly",
    "That Fortnite ending was insane",
    "This Fortnite clutch came out of nowhere",
    "Fortnite almost went very wrong",
    "This Fortnite fight got brutal",
    "That Fortnite push actually worked",
    "Fortnite chaos in one short clip",
    "This Fortnite play changed everything",
    "The cleanest Fortnite moment today",
    "This Fortnite fail hurt to watch",
    "Fortnite turned around in seconds",
    "That Fortnite edit was too fast",
    "This Fortnite clip makes no sense",
    "The craziest Fortnite timing",
    "This Fortnite recovery was impossible",
  ],
  MINECRAFT: [
    "This Minecraft moment was cursed",
    "Minecraft went wrong fast",
    "That Minecraft save was unbelievable",
    "This Minecraft clip was too close",
    "Minecraft chaos in a few seconds",
    "This Minecraft move actually worked",
    "That Minecraft ending was perfect",
    "Minecraft almost became a disaster",
    "This Minecraft build failed badly",
    "The weirdest Minecraft moment today",
    "This Minecraft escape was insane",
    "Minecraft turned around instantly",
    "That Minecraft trap was brutal",
    "This Minecraft play was too smart",
    "Minecraft got chaotic fast",
    "This Minecraft recovery was impossible",
  ],
  BRAWL_STARS: [
    "This Brawl Stars clip was crazy",
    "Brawl Stars turned instantly",
    "That Brawl Stars finish was brutal",
    "This Brawl Stars push was perfect",
    "Brawl Stars chaos in one minute",
    "This Brawl Stars comeback was insane",
    "That Brawl Stars timing was unreal",
    "This Brawl Stars fail hurt",
    "Brawl Stars went wrong fast",
    "This Brawl Stars round made no sense",
    "The cleanest Brawl Stars moment today",
    "That Brawl Stars clutch was wild",
    "This Brawl Stars play changed everything",
    "Brawl Stars got crazy at the end",
    "This Brawl Stars escape should not work",
    "That Brawl Stars ending was too close",
  ],
  DOTA2: [
    "This Dota 2 fight was insane",
    "Dota 2 turned around instantly",
    "That Dota 2 timing was perfect",
    "This Dota 2 clip got brutal fast",
    "Dota 2 chaos in a short clip",
    "This Dota 2 save was unbelievable",
    "That Dota 2 fight made no sense",
    "This Dota 2 comeback was wild",
    "Dota 2 almost ended in disaster",
    "That Dota 2 play was too clean",
    "This Dota 2 fail hurt to watch",
    "Dota 2 got out of control fast",
    "That Dota 2 ending was crazy",
    "This Dota 2 escape was impossible",
    "The cleanest Dota 2 moment today",
    "This Dota 2 fight changed everything",
  ],
  OTHER: [
    "This gaming clip was insane",
    "That ending was wild",
    "This moment made no sense",
    "Gaming chaos in one short clip",
    "This play changed everything",
    "That timing was unreal",
    "This clip went wrong fast",
    "The cleanest moment today",
    "This comeback was unbelievable",
    "That finish was brutal",
    "This play should not have worked",
    "Gaming got crazy instantly",
    "This clip was too close",
    "That recovery was impossible",
    "This moment turned around fast",
    "One of the wildest gaming clips today",
  ],
};

const GENERIC_WATCHER_PREFIXES = [
  "lana watches",
  "mia watches",
  "amelia watches",
  "ember watches",
  "watching",
  "reacts to",
  "reacts",
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

function normalizeCustomTheme(value?: string | null) {
  const clean = value?.trim().replace(/\s+/g, " ");

  if (!clean) {
    return null;
  }

  const normalized = clean.toLowerCase();

  if (GENERIC_WATCHER_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return null;
  }

  return clean.slice(0, 42);
}

function toThemePrefix(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildClipTitle(input: {
  game: FactoryGame;
  clipIndex: number;
  customPrefix?: string | null;
  seedHint?: string | number | null;
}) {
  const variants = GAME_TITLE_VARIANTS[input.game] ?? GAME_TITLE_VARIANTS.OTHER;
  const seed = createSeed(
    [input.game, input.clipIndex, input.seedHint ?? "", input.customPrefix ?? ""]
      .join(":")
      .toLowerCase(),
  );

  const randomTitle = pickVariant(variants, seed);
  const customTheme = normalizeCustomTheme(input.customPrefix);
  const title = customTheme
    ? `${toThemePrefix(customTheme)} | ${randomTitle}`
    : randomTitle;

  return title.slice(0, 95);
}

export function buildClipDescription(input: {
  game: FactoryGame;
  customPrefix?: string | null;
}) {
  const meta = getGameMeta(input.game);
  const customTheme = normalizeCustomTheme(input.customPrefix);

  return [
    customTheme
      ? `${meta.label} short clip. Theme: ${customTheme}.`
      : `${meta.label} short gaming clip.`,
    "",
    meta.hashtags.join(" "),
  ].join("\n");
}
