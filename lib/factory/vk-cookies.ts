import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export type ParsedVkCookie = {
  domain: string;
  path: string;
  name: string;
  value: string;
  expires?: number;
};

const VK_COOKIE_DOMAINS = ["vk.com", "vk.ru", "vkvideo.ru"];

let cachedCookieText: string | null | undefined;
let cachedCookieHeader: string | null | undefined;
let cachedCookiesFilePath: string | null | undefined;

function normalizeCookieDomain(domain: string) {
  return domain.trim().toLowerCase().replace(/^#httponly_/i, "").replace(/^\./, "");
}

function isVkCookieDomain(domain: string) {
  const normalized = normalizeCookieDomain(domain);
  return VK_COOKIE_DOMAINS.some((allowed) => normalized === allowed || normalized.endsWith(`.${allowed}`));
}

function decodeCookiesB64(value: string) {
  const trimmed = value.trim().replace(/^data:[^,]+,/, "");
  return Buffer.from(trimmed, "base64").toString("utf8");
}

async function loadCookieText() {
  if (cachedCookieText !== undefined) return cachedCookieText;

  const b64 = process.env.VK_COOKIES_B64?.trim();
  if (b64) {
    cachedCookieText = decodeCookiesB64(b64);
    return cachedCookieText;
  }

  const cookiePath = process.env.VK_COOKIES_PATH?.trim();
  if (cookiePath) {
    cachedCookieText = await readFile(cookiePath, "utf8");
    return cachedCookieText;
  }

  cachedCookieText = null;
  return cachedCookieText;
}

export function parseNetscapeCookies(text: string): ParsedVkCookie[] {
  const now = Math.floor(Date.now() / 1000);
  const cookies: ParsedVkCookie[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const httpOnlyLine = line.startsWith("#HttpOnly_");
    if (line.startsWith("#") && !httpOnlyLine) continue;

    const normalizedLine = httpOnlyLine ? line.replace(/^#HttpOnly_/i, "") : line;
    const parts = normalizedLine.split("\t");

    if (parts.length >= 7) {
      const [domain, , path, , expiresRaw, name, ...valueParts] = parts;
      const expires = Number(expiresRaw);
      if (!domain || !name || !isVkCookieDomain(domain)) continue;
      if (Number.isFinite(expires) && expires > 0 && expires < now) continue;
      cookies.push({ domain: normalizeCookieDomain(domain), path: path || "/", name, value: valueParts.join("\t"), expires });
      continue;
    }

    // Fallback: allow simple Cookie header text: name=value; name2=value2
    if (line.includes("=") && !line.includes("\t")) {
      for (const item of line.split(";")) {
        const [name, ...valueParts] = item.trim().split("=");
        const value = valueParts.join("=");
        if (!name || !value) continue;
        cookies.push({ domain: "vk.com", path: "/", name, value });
      }
    }
  }

  const unique = new Map<string, ParsedVkCookie>();
  for (const cookie of cookies) {
    unique.set(`${cookie.domain}:${cookie.path}:${cookie.name}`, cookie);
  }
  return Array.from(unique.values());
}

export async function getVkCookieHeader() {
  if (cachedCookieHeader !== undefined) return cachedCookieHeader;
  const text = await loadCookieText();
  if (!text) {
    cachedCookieHeader = null;
    return cachedCookieHeader;
  }

  const cookies = parseNetscapeCookies(text);
  cachedCookieHeader = cookies.length ? cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ") : null;
  console.info("[VK_COOKIES] loaded", {
    enabled: Boolean(cachedCookieHeader),
    cookieCount: cookies.length,
    domains: Array.from(new Set(cookies.map((cookie) => cookie.domain))).filter((domain) => VK_COOKIE_DOMAINS.some((allowed) => domain.endsWith(allowed))),
  });
  return cachedCookieHeader;
}

export async function getVkCookiesStatus() {
  const text = await loadCookieText();
  const cookies = text ? parseNetscapeCookies(text) : [];
  return {
    enabled: cookies.length > 0,
    source: process.env.VK_COOKIES_B64?.trim() ? "VK_COOKIES_B64" : process.env.VK_COOKIES_PATH?.trim() ? "VK_COOKIES_PATH" : null,
    cookieCount: cookies.length,
    domains: Array.from(new Set(cookies.map((cookie) => cookie.domain))).filter((domain) => VK_COOKIE_DOMAINS.some((allowed) => domain.endsWith(allowed))),
    authMode: process.env.VK_AUTH_MODE?.trim() || (cookies.length ? "cookies" : "public"),
  };
}

export async function hasVkCookies() {
  return Boolean(await getVkCookieHeader());
}

export async function getVkCookiesFileForYtDlp() {
  if (cachedCookiesFilePath !== undefined) return cachedCookiesFilePath;
  const text = await loadCookieText();
  if (!text) {
    cachedCookiesFilePath = null;
    return cachedCookiesFilePath;
  }

  const dir = join(tmpdir(), "gidegide-vk-cookies");
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, "cookies.txt");
  await writeFile(filePath, text, "utf8");
  cachedCookiesFilePath = filePath;
  return cachedCookiesFilePath;
}
