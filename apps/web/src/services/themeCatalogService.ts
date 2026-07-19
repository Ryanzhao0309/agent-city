import type { MapSurrounding, ThemePackDefinition } from "../types";
import { apiUrl } from "./api";

interface ThemeCatalogResponse {
  schemaVersion: 1;
  repository: string;
  themes: Array<{
    id: string;
    name: string;
    version: string;
    kind: ThemePackDefinition["kind"];
    icon: string;
    summary: string;
    creatorName: string;
    creatorUrl: string;
    license: string;
    minAgentCityVersion: string;
    previewUrl: string;
    sourceUrl: string;
    mapSurrounding: MapSurrounding;
    buildingSkins: Record<string, string>;
    assets: NonNullable<ThemePackDefinition["assets"]>;
    likeIssueNumber?: number;
    likeUrl?: string;
    likeCount?: number;
  }>;
}
export async function listPublishedThemePacks(signal?: AbortSignal): Promise<ThemePackDefinition[]> {
  const response = await fetch(apiUrl("/api/themes/catalog"), { signal });
  const payload = await response.json().catch(() => null) as ThemeCatalogResponse | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && "error" in payload && payload.error ? payload.error : `主题目录请求失败 (${response.status})`);
  }
  if (!payload || !("themes" in payload) || payload.schemaVersion !== 1 || !Array.isArray(payload.themes)) {
    throw new Error("主题目录格式无效。");
  }
  return payload.themes.map((theme) => ({
    ...theme,
    remote: true,
  }));
}
