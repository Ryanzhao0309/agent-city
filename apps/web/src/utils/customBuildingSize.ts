export const DEFAULT_CUSTOM_BUILDING_SIZE: [number, number] = [2, 2];

export interface ThemeBuildingSpec {
  type: string;
  size: [number, number];
}

const TYPE_SIZES: Record<string, [number, number]> = {
  "city-hall": [12, 12],
  "agent-home": [6, 6],
  "task-hall": [7, 5],
  "skill-market": [5, 5],
  archive: [6, 7],
  "data-center": [5, 5],
  "server-room": [7, 6],
  "theme-hall": [6, 6],
  "custom-link": [5, 5],
};

const PACK_TYPES: Record<string, string[]> = {
  "megalithic-single-pack": [
    "city-hall",
    "agent-home",
    "skill-market",
    "archive",
    "server-room",
    "data-center",
    "theme-hall",
    "agent-home",
  ],
  "changan-pack": [
    "city-hall",
    "agent-home",
    "task-hall",
    "skill-market",
    "archive",
    "data-center",
    "server-room",
    "theme-hall",
    "custom-link",
  ],
  "sky-observatory-pack": [
    "city-hall",
    "agent-home",
    "task-hall",
    "skill-market",
    "archive",
    "data-center",
    "server-room",
    "theme-hall",
    "custom-link",
  ],
};

export function inferThemeBuildingType(url: string | undefined): string | null {
  if (!url) return null;
  if (url.includes("/buildings/custom/todo-hall.")) return "task-hall";

  for (const [pack, types] of Object.entries(PACK_TYPES)) {
    if (!url.includes(`/buildings/${pack}/`)) continue;
    const fileName = url.split("/").pop() ?? "";
    const index = Number.parseInt(fileName.slice(0, 2), 10) - 1;
    return types[index] ?? null;
  }
  return null;
}

export function getThemeBuildingSpec(url: string | undefined): ThemeBuildingSpec | null {
  const type = inferThemeBuildingType(url);
  if (!type) return null;
  const size = TYPE_SIZES[type];
  return size ? { type, size } : null;
}

export function inferThemeBuildingSize(url: string | undefined): [number, number] | null {
  return getThemeBuildingSpec(url)?.size ?? null;
}

export function getCustomBuildingSize(url: string | undefined): [number, number] {
  return inferThemeBuildingSize(url) ?? DEFAULT_CUSTOM_BUILDING_SIZE;
}
