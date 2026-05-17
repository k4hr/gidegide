export type RobloxStoryUniqueInput = {
  title?: string | null;
  sourceTitle?: string | null;
  storyStyle?: string | null;
  musicMood?: string | null;
  clipIndex?: number;
  seed?: number | string | null;
  usedTitles: Set<string>;
};

export type RobloxOverlayUniqueInput = {
  text?: string | null;
  sourceTitle?: string | null;
  storyStyle?: string | null;
  musicMood?: string | null;
  clipIndex?: number;
  seed?: number | string | null;
  usedOverlays: Set<string>;
  useEmojis?: boolean;
  fallbackRole?: "hook" | "conflict" | "escalation" | "punchline";
};

const BAD_TITLE_PARTS = [
  "roblox gave him one choice",
  "wait for the ending",
  "watch till the end",
  "wait for it",
  "nobody expected this ending",
  "this got way too close",
  "the ending changed everything",
  "roblox story",
  "roblox moment",
  "roblox moments",
  "roblox game",
  "roblox clip",
  "he should not have survived",
  "he almost lost everything",
  "the final move saved the run",
  "the last second changed it",
  "this looked impossible",
  "this clip turned insane",
  "this moment got chaotic",
  "that save was way too lucky",
  "final move saved",
  "almost lost everything",
  "should not have survived",
];

const BAD_OVERLAY_PARTS = [
  "bacon was all alone",
  "watch this",
  "wait for it",
  "roblox gave him one choice",
  "the ending made me cry",
  "roblox moment",
  "starting soon",
];

const STYLE_TITLE_BANK: Record<string, string[]> = {
  poor_rich: [
    "Roblox poor Bacon found a rich secret.. 😳",
    "Roblox rich kids ignored him until this happened 💔",
    "Roblox made him choose poor or rich 😭",
    "This Roblox noob became rich for one reason 💸",
    "Roblox poor vs rich ended so wrong.. 😱",
    "Roblox gave the poor noob one last chance 🥺",
  ],
  bullied_bacon: [
    "Roblox bullies laughed at Bacon.. then this happened 😳",
    "They bullied Bacon in Roblox and regretted it 😭",
    "Roblox Bacon got revenge after everyone laughed 💔",
    "Nobody helped Bacon in Roblox until the end 🥺",
    "Roblox bullies made one huge mistake 😱",
    "Bacon was bullied in Roblox for being poor.. 💔",
  ],
  love_money: [
    "Roblox made him pick love or money.. 😭💔",
    "He chose Robux over love in Roblox.. 😳",
    "Roblox love story turned into a money test 💸",
    "She tested him with money in Roblox 😭",
    "Roblox gave him love and Robux but only one choice 💔",
    "He picked the wrong girl in Roblox.. 😱",
  ],
  save_mom_or_money: [
    "Roblox made him save mom or take money.. 😭",
    "He had to choose mom or Robux in Roblox 💔",
    "This Roblox choice was actually heartbreaking 😳",
    "Roblox gave him 10 seconds to save her 😭",
    "He picked money in Roblox and lost everything 💸",
    "Roblox forced Bacon to choose family or rich life 🥺",
  ],
  choice_punishment: [
    "Roblox punished him for picking the wrong door 😱",
    "He chose the wrong side in Roblox.. 💀",
    "Roblox gave him 2 doors and one was cursed 😳",
    "This Roblox choice changed his whole life 😭",
    "He had 5 seconds to choose in Roblox ⏰",
    "Roblox made the wrong choice look safe.. 😨",
  ],
  revenge: [
    "Roblox noob got revenge after they betrayed him 😳",
    "They laughed at him in Roblox until he came back 💔",
    "Roblox revenge story ended perfectly 😭",
    "He became strong in Roblox for revenge 😱",
    "Everyone regretted bullying him in Roblox 😳",
    "Roblox Bacon waited for the perfect revenge 💀",
  ],
  gift_betrayal: [
    "Roblox gave him a gift but it was a trap 🎁😱",
    "She opened the Roblox gift and regretted it 😭",
    "This Roblox gift changed everything 🎁",
    "He trusted the wrong gift in Roblox.. 💔",
    "Roblox surprise box had a dark secret 😳",
    "The Roblox present was not what it seemed 😨",
  ],
  horror_escape: [
    "Roblox told him not to open that door 😨",
    "He escaped Roblox horror with one second left 😱",
    "This Roblox monster waited behind the door 💀",
    "Roblox horror turned real at the end 😳",
    "He should not have gone inside in Roblox 😨",
    "Roblox escape got scary way too fast 😱",
  ],
  funny_fail: [
    "Roblox Bacon failed in the funniest way 😭",
    "This Roblox mistake was actually hilarious 💀",
    "He panicked in Roblox and ruined everything 😂",
    "Roblox timing made this fail perfect 😭",
    "This Roblox fail came out of nowhere 😳",
    "He tried to be smart in Roblox and failed 💀",
  ],
  system_message: [
    "Roblox system gave him a cursed choice 😳",
    "The Roblox system said he had 10 seconds 😱",
    "Roblox system picked his life for him 💔",
    "This Roblox admin message changed everything 😭",
    "Roblox gave him one rule and he broke it 😨",
    "The Roblox warning was not a joke 💀",
  ],
  auto: [
    "Roblox Bacon had 10 seconds to choose 😳",
    "This Roblox story changed so fast 😭",
    "Roblox gave the noob a final chance 🥺",
    "He made the worst Roblox choice ever 😱",
    "Nobody believed him in Roblox.. 💔",
    "Roblox turned a normal day into chaos 😳",
    "This Roblox ending actually hurt 😭",
    "He found the secret Roblox choice 💀",
    "Roblox made him choose the wrong person 😱",
    "Roblox Bacon had one chance left 😳",
    "He lost everything in Roblox for one mistake 💔",
    "Roblox Bacon found out the truth too late 😭",
  ],
};

const STYLE_OVERLAY_BANK: Record<string, Record<"hook" | "conflict" | "escalation" | "punchline", string[]>> = {
  poor_rich: {
    hook: ["POOR BACON\nFOUND A SECRET 😳", "RICH KIDS\nLAUGHED AT HIM 💔", "HE HAD\nNO ROBUX 😭", "POOR OR RICH\nCHOOSE NOW 💸"],
    conflict: ["THEY SAID\nHE WAS NOTHING", "HE ONLY HAD\nONE CHANCE", "THE RICH KID\nTOOK EVERYTHING", "NOBODY WANTED\nTO HELP HIM"],
    escalation: ["THEN HE FOUND\nA SECRET DOOR", "THE SYSTEM\nCHANGED HIS LIFE", "EVERYONE\nSTARTED WATCHING", "THEY MADE\nA HUGE MISTAKE"],
    punchline: ["NOW WHO\nIS LAUGHING? 😳", "HE BECAME\nRICH?! 💸", "COMMENT\nPOOR OR RICH 👇", "THE ENDING\nIS CRAZY 😭"],
  },
  bullied_bacon: {
    hook: ["THEY BULLIED\nBACON AGAIN 💔", "BACON HAD\nNO FRIENDS 😭", "EVERYONE\nLAUGHED AT HIM", "BACON WAS\nLEFT BEHIND 🥺"],
    conflict: ["THEY STOLE\nHIS ROBUX", "NO ONE\nDEFENDED HIM", "THE ADMIN\nIGNORED BACON", "HIS FRIEND\nBETRAYED HIM"],
    escalation: ["THEN BACON\nFOUND POWER 😳", "THE BULLIES\nWENT TOO FAR", "HE CAME BACK\nDIFFERENT", "THEY DID NOT\nEXPECT THIS"],
    punchline: ["BACON GOT\nREVENGE 😱", "THEY REGRET\nEVERYTHING", "COMMENT\nHELP BACON 👇", "THIS ENDING\nHURT 😭"],
  },
  love_money: {
    hook: ["LOVE OR\nMONEY?! 😳💔", "SHE TESTED\nHIM WITH ROBUX", "HE HAD TO\nCHOOSE HER 😭", "ROBUX OR\nTRUE LOVE? 💸"],
    conflict: ["SHE SAID\nPICK ONE", "THE MONEY\nLOOKED TOO EASY", "HIS GIRLFRIEND\nWAS WATCHING", "HE MADE\nA PROMISE"],
    escalation: ["THEN SHE\nSTARTED CRYING", "THE CHOICE\nWAS A TRAP", "HE PICKED\nTOO FAST", "EVERYONE\nSAW IT"],
    punchline: ["HE LOST\nBOTH 😭", "WOULD YOU\nPICK MONEY? 👇", "SHE WAS\nTESTING HIM 💔", "BAD CHOICE\nBRO 😱"],
  },
  save_mom_or_money: {
    hook: ["SAVE MOM\nOR MONEY?! 😭", "MOM OR\nROBUX? 💔", "HE HAD\n10 SECONDS ⏰", "THIS CHOICE\nWAS HEARTBREAKING"],
    conflict: ["THE TIMER\nSTARTED NOW", "THE MONEY\nWAS RIGHT THERE", "MOM NEEDED\nHELP FAST", "HE COULD\nONLY PICK ONE"],
    escalation: ["THE TIMER\nWAS RUNNING OUT", "HE LOOKED\nAT THE ROBUX", "MOM WAS\nSTILL WAITING", "EVERYONE\nWAS SCREAMING"],
    punchline: ["WHAT WOULD\nYOU DO? 👇", "HE CHOSE\nWRONG 😭", "MOM SAW\nEVERYTHING 💔", "THIS ENDING\nBROKE ME"],
  },
  choice_punishment: {
    hook: ["PICK A DOOR\nRIGHT NOW 😳", "ONE DOOR\nIS CURSED 💀", "HE CHOSE\nTOO FAST 😱", "THE SYSTEM\nGAVE 2 CHOICES"],
    conflict: ["LEFT LOOKED\nSAFE", "RIGHT HAD\nA SECRET", "THE ADMIN\nWAS WATCHING", "NO ONE\nWARNED HIM"],
    escalation: ["THE FLOOR\nDISAPPEARED", "THE DOOR\nLOCKED BEHIND HIM", "THE CHOICE\nWAS FAKE", "THEN THE\nTIMER STARTED"],
    punchline: ["WRONG DOOR\nBRO 😭", "COMMENT\nLEFT OR RIGHT 👇", "HE GOT\nPUNISHED 💀", "NEVER TRUST\nROBLOX DOORS"],
  },
  revenge: {
    hook: ["THEY BETRAYED\nHIM FIRST 💔", "HE CAME BACK\nFOR REVENGE 😳", "BACON REMEMBERED\nEVERYTHING", "THEY LAUGHED\nTOO EARLY"],
    conflict: ["HIS FRIEND\nLEFT HIM", "THE BULLIES\nTOOK HIS PLACE", "HE LOST\nEVERYTHING", "NO ONE\nBELIEVED HIM"],
    escalation: ["THEN HE\nGOT STRONGER", "THEY SAW\nHIM RETURN", "HE HAD\nA PLAN", "THE TRAP\nWAS READY"],
    punchline: ["REVENGE\nWAS PERFECT 😱", "THEY ALL\nSAID SORRY", "BACON WON\nIN THE END", "WOULD YOU\nFORGIVE THEM? 👇"],
  },
  gift_betrayal: {
    hook: ["OPEN THE\nGIFT? 🎁", "THE GIFT\nWAS A TRAP 😱", "SHE GAVE\nHIM A BOX", "THIS PRESENT\nLOOKED NORMAL"],
    conflict: ["HE TRUSTED\nHER TOO FAST", "THE BOX\nSTARTED MOVING", "EVERYONE\nRAN AWAY", "THE NOTE\nSAID DON'T OPEN"],
    escalation: ["THEN IT\nTURNED RED", "THE ROOM\nWENT DARK", "SHE STARTED\nLAUGHING", "THE GIFT\nOPENED ITSELF"],
    punchline: ["NEVER OPEN\nTHAT GIFT 😭", "SHE BETRAYED\nHIM 💔", "COMMENT\nOPEN OR RUN 👇", "THE GIFT\nWAS CURSED"],
  },
  horror_escape: {
    hook: ["DON'T OPEN\nTHAT DOOR 😨", "SOMETHING\nIS BEHIND HIM", "RUN NOW\nROBLOX 😱", "THE WARNING\nWAS REAL 💀"],
    conflict: ["THE DOOR\nLOCKED ITSELF", "HE HEARD\nFOOTSTEPS", "THE MONSTER\nWAS CLOSE", "THE LIGHTS\nTURNED OFF"],
    escalation: ["IT STARTED\nCHASING HIM", "HE HAD\nONE WAY OUT", "THE EXIT\nWAS FAKE", "THE SOUND\nGOT LOUDER"],
    punchline: ["HE ESCAPED\nBARELY 😱", "NEVER GO\nBACK THERE", "COMMENT\nRUN OR HIDE 👇", "THE ENDING\nWAS SCARY"],
  },
  funny_fail: {
    hook: ["BRO PANICKED\nSO FAST 😂", "ROBLOX FAIL\nINCOMING 💀", "HE THOUGHT\nHE WAS SMART", "THIS WAS\nTOO FUNNY 😭"],
    conflict: ["THE JUMP\nLOOKED EASY", "HE STARTED\nSHOWING OFF", "EVERYONE\nWAS WATCHING", "ONE MOVE\nRUINED IT"],
    escalation: ["THEN HE\nMISSED IT", "THE TIMING\nWAS PERFECT", "HE FELL\nSO SLOWLY", "THE GAME\nSAID NO"],
    punchline: ["BIGGEST FAIL\nEVER 💀", "BRO LOST\nEVERYTHING 😂", "I WOULD\nRAGE QUIT", "COMMENT\nRIP BACON 👇"],
  },
  auto: {
    hook: ["BACON HAD\n10 SECONDS 😳", "THIS ROBLOX\nCHOICE WAS CRAZY", "NOBODY\nBELIEVED HIM 💔", "HE FOUND\nA SECRET 😱", "ROBLOX GAVE\nA FINAL CHANCE", "THIS STARTED\nSO NORMAL 😭"],
    conflict: ["THE TIMER\nSTARTED NOW", "HIS FRIEND\nDISAPPEARED", "THE ADMIN\nSAID CHOOSE", "THE DOOR\nLOCKED BEHIND HIM", "SHE WAS\nWATCHING HIM", "THE MONEY\nWAS FAKE"],
    escalation: ["THEN EVERYTHING\nCHANGED", "WAIT...\nWHAT?! 😱", "IT GOT\nEVEN WORSE", "HE WAS\nTOO LATE", "THEY MADE\nA MISTAKE", "THE SECRET\nWAS REAL"],
    punchline: ["WHAT WOULD\nYOU PICK? 👇", "THE ENDING\nIS WILD 😭", "HE CHOSE\nWRONG 😱", "COMMENT\nYOUR CHOICE", "I DID NOT\nEXPECT THAT", "BACON DESERVED\nBETTER 💔"],
  },
};

function hashValue(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function normalizeRobloxTextKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, " ")
    .replace(/[^a-z0-9а-яё]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanInline(value: string) {
  return value.replace(/\s+/g, " ").replace(/\s+([?!.,:])/g, "$1").trim();
}

function cleanOverlay(value: string, useEmojis = true) {
  let text = value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("\n")
    .trim();

  if (!useEmojis) {
    text = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").trim();
  }

  return text.toUpperCase().slice(0, 90);
}

function normalizeStyle(value?: string | null) {
  const normalized = String(value ?? "auto").trim().toLowerCase();
  return STYLE_TITLE_BANK[normalized] || STYLE_OVERLAY_BANK[normalized] ? normalized : "auto";
}

function seedNumber(seed?: number | string | null, clipIndex = 1) {
  if (typeof seed === "number" && Number.isFinite(seed)) return Math.abs(Math.floor(seed));
  const text = `${seed ?? ""}:${clipIndex}`;
  return hashValue(text);
}

function isBadTitle(value: string) {
  const key = normalizeRobloxTextKey(value);

  if (!key || key === "roblox") return true;
  if (/^roblox (choice|system|story|horror|moment|game|clip)(\s|$)/i.test(key)) return true;

  return BAD_TITLE_PARTS.some((part) => key.includes(normalizeRobloxTextKey(part)));
}

function isBadOverlay(value: string) {
  const key = normalizeRobloxTextKey(value);

  if (!key) return true;
  if (key.length <= 4) return true;

  return BAD_OVERLAY_PARTS.some((part) => key.includes(normalizeRobloxTextKey(part)));
}

function storyTitlePool(storyStyle?: string | null) {
  const style = normalizeStyle(storyStyle);
  const exact = STYLE_TITLE_BANK[style] ?? [];
  return [...exact, ...STYLE_TITLE_BANK.auto];
}

function overlayPool(role: "hook" | "conflict" | "escalation" | "punchline", storyStyle?: string | null) {
  const style = normalizeStyle(storyStyle);
  const exact = STYLE_OVERLAY_BANK[style]?.[role] ?? [];
  return [...exact, ...STYLE_OVERLAY_BANK.auto[role]];
}

export function makeUniqueRobloxStoryTitle(input: RobloxStoryUniqueInput) {
  const clipIndex = input.clipIndex ?? 1;
  const seed = seedNumber(input.seed ?? `${input.sourceTitle ?? "source"}:${input.storyStyle ?? "auto"}`, clipIndex);
  const pool = storyTitlePool(input.storyStyle);
  const raw = cleanInline(String(input.title ?? ""));
  let candidate = raw;

  if (!candidate || isBadTitle(candidate)) {
    candidate = pool[seed % pool.length];
  }

  if (!/roblox/i.test(candidate)) {
    candidate = `Roblox ${candidate}`;
  }

  candidate = cleanInline(candidate).slice(0, 95);

  let attempt = 0;
  while (input.usedTitles.has(normalizeRobloxTextKey(candidate)) || isBadTitle(candidate)) {
    attempt += 1;
    const fallback = pool[(seed + attempt * 7) % pool.length];
    candidate = cleanInline(/roblox/i.test(fallback) ? fallback : `Roblox ${fallback}`).slice(0, 95);

    if (attempt > pool.length + 8) {
      candidate = cleanInline(`${candidate.replace(/[.\s]+$/g, "")} ${clipIndex + attempt}`).slice(0, 95);
      break;
    }
  }

  input.usedTitles.add(normalizeRobloxTextKey(candidate));

  return candidate;
}

export function makeUniqueRobloxOverlay(input: RobloxOverlayUniqueInput) {
  const clipIndex = input.clipIndex ?? 1;
  const role = input.fallbackRole ?? "hook";
  const seed = seedNumber(input.seed ?? `${input.sourceTitle ?? "source"}:${input.storyStyle ?? "auto"}:${role}`, clipIndex);
  const pool = overlayPool(role, input.storyStyle);
  const raw = cleanOverlay(String(input.text ?? ""), input.useEmojis ?? true);
  let candidate = raw;

  if (!candidate || isBadOverlay(candidate)) {
    candidate = cleanOverlay(pool[seed % pool.length], input.useEmojis ?? true);
  }

  let attempt = 0;
  while (input.usedOverlays.has(normalizeRobloxTextKey(candidate)) || isBadOverlay(candidate)) {
    attempt += 1;
    candidate = cleanOverlay(pool[(seed + attempt * 5) % pool.length], input.useEmojis ?? true);

    if (attempt > pool.length + 8) {
      const suffix = role === "hook" ? "😳" : role === "punchline" ? "👇" : "";
      candidate = cleanOverlay(`ROBLOX TWIST\n#${clipIndex + attempt} ${suffix}`, input.useEmojis ?? true);
      break;
    }
  }

  input.usedOverlays.add(normalizeRobloxTextKey(candidate));

  return candidate;
}

export function getUsedTextList(values: Set<string>, limit = 20) {
  return Array.from(values).slice(-limit);
}


export function sanitizeFinalRobloxStoryTitle(input: RobloxStoryUniqueInput) {
  return makeUniqueRobloxStoryTitle(input);
}

export function isBlockedRobloxStoryTitle(title: string) {
  return isBadTitle(title);
}
