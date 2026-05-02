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
    titlePrefix: "Lana watches Roblox",
    hashtags: ["#roblox", "#robloxclips", "#gaming", "#shorts", "#funny"],
  },
  {
    value: "FORTNITE",
    label: "Fortnite",
    titlePrefix: "Lana watches Fortnite",
    hashtags: [
      "#fortnite",
      "#fortniteclips",
      "#gaming",
      "#shorts",
      "#battleRoyale",
    ],
  },
  {
    value: "MINECRAFT",
    label: "Minecraft",
    titlePrefix: "Lana watches Minecraft",
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
    titlePrefix: "Lana watches Brawl Stars",
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
    titlePrefix: "Lana watches Dota 2",
    hashtags: ["#dota2", "#dotaclips", "#gaming", "#shorts", "#moba"],
  },
  {
    value: "OTHER",
    label: "Other",
    titlePrefix: "Lana watches games",
    hashtags: ["#gaming", "#gamingclips", "#shorts", "#funny", "#reaction"],
  },
];

export function getGameMeta(game: FactoryGame) {
  return GAME_OPTIONS.find((option) => option.value === game) ?? GAME_OPTIONS[5];
}

function getWatcherNameFromTitlePrefix(titlePrefix?: string | null) {
  const cleanPrefix = titlePrefix?.trim();

  if (!cleanPrefix) {
    return "the creator";
  }

  const watchesMatch = cleanPrefix.match(/^(.+?)\s+watches\s+/i);

  if (watchesMatch?.[1]) {
    return watchesMatch[1].trim();
  }

  const reactsMatch = cleanPrefix.match(/^(.+?)\s+reacts\s+/i);

  if (reactsMatch?.[1]) {
    return reactsMatch[1].trim();
  }

  const watchingMatch = cleanPrefix.match(/^(.+?)\s+watching\s+/i);

  if (watchingMatch?.[1]) {
    return watchingMatch[1].trim();
  }

  const firstWord = cleanPrefix.split(/\s+/)[0]?.trim();

  return firstWord || "the creator";
}

export function buildClipTitle(input: {
  game: FactoryGame;
  clipIndex: number;
  customPrefix?: string | null;
}) {
  const meta = getGameMeta(input.game);
  const prefix = input.customPrefix?.trim() || meta.titlePrefix;

  return `${prefix} #${input.clipIndex}`;
}

export function buildClipDescription(input: {
  game: FactoryGame;
  customPrefix?: string | null;
}) {
  const meta = getGameMeta(input.game);
  const watcherName = getWatcherNameFromTitlePrefix(input.customPrefix);

  return [
    `${meta.label} gaming clip watched by ${watcherName}.`,
    "",
    meta.hashtags.join(" "),
  ].join("\n");
}
