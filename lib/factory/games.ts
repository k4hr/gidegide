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
    hashtags: ["#fortnite", "#fortniteclips", "#gaming", "#shorts", "#battleRoyale"],
  },
  {
    value: "MINECRAFT",
    label: "Minecraft",
    titlePrefix: "Lana watches Minecraft",
    hashtags: ["#minecraft", "#minecraftclips", "#gaming", "#shorts", "#minecraftmemes"],
  },
  {
    value: "BRAWL_STARS",
    label: "Brawl Stars",
    titlePrefix: "Lana watches Brawl Stars",
    hashtags: ["#brawlstars", "#brawlstarsclips", "#gaming", "#shorts", "#supercell"],
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

export function buildClipTitle(input: {
  game: FactoryGame;
  clipIndex: number;
  customPrefix?: string | null;
}) {
  const meta = getGameMeta(input.game);
  const prefix = input.customPrefix?.trim() || meta.titlePrefix;

  return `${prefix} #${input.clipIndex}`;
}

export function buildClipDescription(game: FactoryGame) {
  const meta = getGameMeta(game);

  return [
    `${meta.label} gaming clip watched by Lana.`,
    "",
    meta.hashtags.join(" "),
  ].join("\n");
}
