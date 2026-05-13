const STORY_EMOJI_FILES = {
  angry: "Angry Cursing.png",
  kiss: "Blowing a Kiss.png",
  celebrate: "Celebrating.png",
  clown: "Clown.png",
  cold: "Cold.png",
  cool: "Cool Sunglasses.png",
  cowboy: "Cowboy.png",
  crazy: "Crazy.png",
  devil: "Devil.png",
  dizzy: "Dizzy.png",
  drool: "Drooling.png",
  drunk: "Drunken.png",
  emotional: "Emotional.png",
  ghost: "Ghost.png",
  grimace: "Grim Teeth Grin.png",
  heart_eyes: "Heart Eyes.png",
  hot: "Hot.png",
  laugh: "Laughing.png",
  cry: "Loudly Crying.png",
  mad: "Mad.png",
  money: "Money.png",
  pinocchio: "Pinocchio.png",
  puke: "Puking.png",
  hands_up: "Raising Hands.png",
  shock: "Shocked.png",
  shush: "Shush.png",
  sick: "Sick Fever.png",
  sleep: "Sleeping.png",
  smile: "Slightly Smiling.png",
  love: "Smile with Hearts over face.png",
  star: "Star Struck.png",
  tears_laugh: "Tears of Joy.png",
  thumbs_up: "Thumbs Up.png",
  wink: "Wink.png",
} as const;

export type StoryEmojiKey = keyof typeof STORY_EMOJI_FILES;

export type StoryTextAsset = {
  cleanText: string;
  emojiFiles: string[];
};

const UNICODE_TO_KEYS: Array<{ pattern: RegExp; keys: StoryEmojiKey[] }> = [
  { pattern: /😭|😢|💔/gu, keys: ["cry", "emotional"] },
  { pattern: /😳|😱|😨|😮/gu, keys: ["shock"] },
  { pattern: /😂|🤣/gu, keys: ["tears_laugh"] },
  { pattern: /😈|👿/gu, keys: ["devil"] },
  { pattern: /😍|🥰|❤️|💘/gu, keys: ["love"] },
  { pattern: /💰|💸|🤑/gu, keys: ["money"] },
  { pattern: /🎁/gu, keys: ["celebrate"] },
  { pattern: /👏|🙌/gu, keys: ["hands_up"] },
  { pattern: /👍/gu, keys: ["thumbs_up"] },
  { pattern: /😉/gu, keys: ["wink"] },
  { pattern: /🤫/gu, keys: ["shush"] },
  { pattern: /🤢|🤮/gu, keys: ["puke"] },
  { pattern: /🥵/gu, keys: ["hot"] },
  { pattern: /🥶/gu, keys: ["cold"] },
  { pattern: /😴|💤/gu, keys: ["sleep"] },
  { pattern: /👻/gu, keys: ["ghost"] },
  { pattern: /🤡/gu, keys: ["clown"] },
  { pattern: /🤠/gu, keys: ["cowboy"] },
  { pattern: /😜|🤪/gu, keys: ["crazy"] },
  { pattern: /😷|🤒/gu, keys: ["sick"] },
  { pattern: /😵/gu, keys: ["dizzy"] },
  { pattern: /😬/gu, keys: ["grimace"] },
  { pattern: /😏/gu, keys: ["smile"] },
  { pattern: /😘/gu, keys: ["kiss"] },
];

const KEYWORD_TO_KEYS: Array<{ pattern: RegExp; keys: StoryEmojiKey[] }> = [
  { pattern: /\b(love|crush|heart|date|kiss)\b/iu, keys: ["love"] },
  { pattern: /\b(money|rich|robux|cash|gift card)\b/iu, keys: ["money"] },
  { pattern: /\b(cry|sad|alone|bullied|poor|lost|hurt)\b/iu, keys: ["emotional"] },
  { pattern: /\b(scary|ghost|haunted|evil|monster|demon)\b/iu, keys: ["ghost", "shock"] },
  { pattern: /\b(shock|what|wait|omg|caught|exposed|ending)\b/iu, keys: ["shock"] },
  { pattern: /\b(funny|laugh|lol|joke|troll|prank)\b/iu, keys: ["tears_laugh"] },
  { pattern: /\b(clown)\b/iu, keys: ["clown"] },
  { pattern: /\b(sick|ill|fever)\b/iu, keys: ["sick"] },
  { pattern: /\b(hot|fire)\b/iu, keys: ["hot"] },
  { pattern: /\b(cold|freeze|snow)\b/iu, keys: ["cold"] },
  { pattern: /\b(sleep|bed|night)\b/iu, keys: ["sleep"] },
  { pattern: /\b(wink)\b/iu, keys: ["wink"] },
  { pattern: /\b(secret|quiet|shhh)\b/iu, keys: ["shush"] },
  { pattern: /\b(gift|present|surprise)\b/iu, keys: ["celebrate"] },
  { pattern: /\b(save|help|choose|choice)\b/iu, keys: ["hands_up"] },
  { pattern: /\b(win|victory|best)\b/iu, keys: ["thumbs_up", "star"] },
  { pattern: /\b(liar|lying|fake)\b/iu, keys: ["pinocchio"] },
  { pattern: /\b(crazy|wild|insane|chaos)\b/iu, keys: ["crazy"] },
];

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function cleanupOverlayText(value: string) {
  return value
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, "")
    .replace(/[ ]{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function prepareStoryTextAsset(value?: string | null): StoryTextAsset {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return { cleanText: "", emojiFiles: [] };
  }

  const emojiKeys: StoryEmojiKey[] = [];

  for (const matcher of UNICODE_TO_KEYS) {
    if (matcher.pattern.test(raw)) {
      emojiKeys.push(...matcher.keys);
    }
  }

  const cleaned = cleanupOverlayText(raw);

  if (emojiKeys.length === 0) {
    for (const matcher of KEYWORD_TO_KEYS) {
      if (matcher.pattern.test(cleaned)) {
        emojiKeys.push(...matcher.keys);
      }
    }
  }

  return {
    cleanText: cleaned,
    emojiFiles: unique(emojiKeys)
      .slice(0, 2)
      .map((key) => STORY_EMOJI_FILES[key]),
  };
}
