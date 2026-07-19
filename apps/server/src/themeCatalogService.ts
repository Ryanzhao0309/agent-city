import { safeFetchText } from "./safeNetwork.js";

const REPOSITORY = "Ryanzhao0309/agent-city-themes";
const CATALOG_URL = `https://api.github.com/repos/${REPOSITORY}/contents/catalog.json?ref=main`;
const CACHE_MS = 5 * 60 * 1000;
const MAX_THEMES = 100;
const THEME_ID = /^theme-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BUILDING_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAPS = new Set([
  "plain", "sea", "forest", "megalithic", "lava", "undersea", "toy-workshop",
  "changan-city", "sky-observatory", "volcanic-forge", "polar-crystal",
]);

export interface PublishedTheme {
  id: string;
  name: string;
  version: string;
  kind: "skin" | "terrain" | "complete";
  icon: string;
  summary: string;
  creatorName: string;
  creatorUrl: string;
  license: string;
  minAgentCityVersion: string;
  previewUrl: string;
  sourceUrl: string;
  mapSurrounding: string;
  buildingSkins: Record<string, string>;
  likeIssueNumber?: number;
  likeUrl?: string;
  likeCount?: number;
}

export interface PublishedThemeCatalog {
  schemaVersion: 1;
  repository: string;
  themes: PublishedTheme[];
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength ? value : null;
}

function trustedUrl(value: unknown, kind: "asset" | "repository" | "creator", themeId?: string): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    if (kind === "asset") {
      const prefix = `/Ryanzhao0309/agent-city-themes/main/themes/${themeId}/assets/`;
      return url.hostname === "raw.githubusercontent.com" && url.pathname.startsWith(prefix) ? url.toString() : null;
    }
    if (kind === "creator") return url.hostname === "github.com" ? url.toString() : null;
    return url.hostname === "github.com" && url.pathname.startsWith(`/${REPOSITORY}`) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseThemeCatalog(value: unknown): PublishedThemeCatalog {
  const root = record(value);
  if (!root || root.schemaVersion !== 1 || root.repository !== `https://github.com/${REPOSITORY}` || !Array.isArray(root.themes)) {
    throw new Error("Invalid theme catalog header.");
  }
  if (root.themes.length > MAX_THEMES) throw new Error("Theme catalog exceeds the supported size.");
  const ids = new Set<string>();
  const themes = root.themes.map((item, index): PublishedTheme => {
    const theme = record(item);
    if (!theme) throw new Error(`Theme ${index} is not an object.`);
    const id = text(theme.id, 80);
    const name = text(theme.name, 60);
    const version = text(theme.version, 30);
    const kind = theme.kind;
    const icon = text(theme.icon, 8);
    const summary = text(theme.summary, 180);
    const creatorName = text(theme.creatorName, 80);
    const creatorUrl = trustedUrl(theme.creatorUrl, "creator");
    const license = text(theme.license, 80);
    const minAgentCityVersion = text(theme.minAgentCityVersion, 30);
    const mapSurrounding = text(theme.mapSurrounding, 40);
    if (!id || !THEME_ID.test(id) || ids.has(id)) throw new Error(`Theme ${index} has an invalid or duplicate id.`);
    ids.add(id);
    if (!name || !/^\d+\.\d+\.\d+$/.test(version ?? "") || !["skin", "terrain", "complete"].includes(String(kind)) ||
      !icon || !summary || !creatorName || !creatorUrl || !license || !/^\d+\.\d+\.\d+$/.test(minAgentCityVersion ?? "") ||
      !mapSurrounding || !MAPS.has(mapSurrounding)) {
      throw new Error(`Theme ${id} has invalid metadata.`);
    }
    const previewUrl = trustedUrl(theme.previewUrl, "asset", id);
    const sourceUrl = trustedUrl(theme.sourceUrl, "repository");
    const skins = record(theme.buildingSkins);
    if (!previewUrl || !sourceUrl || !skins) throw new Error(`Theme ${id} has invalid URLs.`);
    const buildingSkins: Record<string, string> = {};
    for (const [key, rawUrl] of Object.entries(skins)) {
      const url = trustedUrl(rawUrl, "asset", id);
      if (!BUILDING_KEY.test(key) || !url) throw new Error(`Theme ${id} has an invalid building skin.`);
      buildingSkins[key] = url;
    }
    const likeIssueNumber = theme.likeIssueNumber;
    const likeUrl = likeIssueNumber === undefined ? undefined : trustedUrl(theme.likeUrl, "repository");
    if (likeIssueNumber !== undefined && (!Number.isInteger(likeIssueNumber) || Number(likeIssueNumber) < 1 || !likeUrl)) {
      throw new Error(`Theme ${id} has invalid like metadata.`);
    }
    return {
      id, name, version: version!, kind: kind as PublishedTheme["kind"], icon, summary,
      creatorName, creatorUrl, license, minAgentCityVersion: minAgentCityVersion!, previewUrl,
      sourceUrl, mapSurrounding, buildingSkins,
      ...(likeIssueNumber === undefined ? {} : { likeIssueNumber: Number(likeIssueNumber), likeUrl: likeUrl! }),
    };
  });
  return { schemaVersion: 1, repository: root.repository, themes };
}

export function parseLikeCount(value: unknown): number {
  const issue = record(value);
  const reactions = record(issue?.reactions);
  const count = reactions?.["+1"];
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

export function parseGitHubJsonContent(value: unknown): unknown {
  const file = record(value);
  if (!file || file.type !== "file" || file.encoding !== "base64" || typeof file.content !== "string") {
    throw new Error("GitHub theme catalog response is invalid.");
  }
  const decoded = Buffer.from(file.content.replace(/\s/g, ""), "base64").toString("utf8");
  return JSON.parse(decoded);
}

async function fetchJson(url: string, allowedHosts: string[], headers: Record<string, string> = {}): Promise<unknown> {
  const response = await safeFetchText(url, { allowedHosts, headers, timeoutMs: 10_000 });
  if (response.status !== 200 || response.truncated || !response.contentType.toLowerCase().includes("json")) {
    throw new Error(`Theme service returned HTTP ${response.status}.`);
  }
  return JSON.parse(response.body);
}

let cache: { expiresAt: number; value: PublishedThemeCatalog } | null = null;

export async function getPublishedThemeCatalog(): Promise<PublishedThemeCatalog> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  const catalogFile = await fetchJson(CATALOG_URL, ["api.github.com"], { Accept: "application/vnd.github+json" });
  const catalog = parseThemeCatalog(parseGitHubJsonContent(catalogFile));
  const themes = await Promise.all(catalog.themes.map(async (theme) => {
    if (!theme.likeIssueNumber) return theme;
    try {
      const issue = await fetchJson(
        `https://api.github.com/repos/${REPOSITORY}/issues/${theme.likeIssueNumber}`,
        ["api.github.com"],
        { Accept: "application/vnd.github+json" }
      );
      return { ...theme, likeCount: parseLikeCount(issue) };
    } catch {
      return theme;
    }
  }));
  const value = { ...catalog, themes };
  cache = { expiresAt: Date.now() + CACHE_MS, value };
  return value;
}
