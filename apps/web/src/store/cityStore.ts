import { create } from "zustand";
import type {
  AiBrainConfig,
  BookmarkGroup,
  BuildingTask,
  BuildingTaskStatus,
  BuildingPurpose,
  BuildingType,
  ChatAttachment,
  CharacterChatMessage,
  CharacterChatSession,
  CharacterCoreFiles,
  CharacterRuntimeConfig,
  AppThemeMode,
  AgentTimedTask,
  AgentWorkSchedule,
  AgentPermissions,
  CityLayout,
  CityTimeOfDay,
  CustomSceneAsset,
  DecorationType,
  DeviceIntegration,
  LayoutScheme,
  LayoutSchemeSnapshot,
  MapSurrounding,
  NpcDefinition,
  PlacedCustomAsset,
  PlacedNpcState,
  PlacedBuilding,
  PlacedDecoration,
  SkillDefinition,
  SkillGroup,
  TerrainType,
  ThemePackDefinition,
} from "../types";
import buildingTypesJson from "../data/buildingTypes.json";
import {
  createDefaultBuildingResidents,
  createDefaultCharacterConfig,
  createDefaultCharacterConfigs,
  getAllCharacters,
  getAssignedResident,
  getCharacterById,
  getDefaultCharacterForBuildingType,
} from "../data/npcCatalog";
import { assignUniqueResident } from "../npcs/characterAssignment";
import { deleteServerAgentSession, listServerAgentMessages, listServerAgentSessions, sendCharacterChat } from "../services/characterChatService";
import { listSecrets } from "../services/secretsService";
import {
  deleteSkillFromAgents,
  installSkillForAgents as installSkillForAgentFiles,
  listAgentConfigs,
  saveAgentConfig,
  saveCitySkillToLibrary,
} from "../services/agentService";
import { createNpcSpawn, getNpcWalkDirection, nextNpcWalkPosition } from "../npcs/npcLogic";
import { canPlace, getPlacedBuildingSize, TERRAIN_SUBDIV } from "../utils/grid";
import { generateLayoutPreview } from "../utils/layoutPreview";
import { loadLayout, saveLayout } from "../utils/storage";
import { getBuildingPurpose, inferBuildingPurpose, isSystemPurpose } from "../utils/buildingPurpose";
import { DEFAULT_CUSTOM_BUILDING_SIZE, getCustomBuildingSize, getThemeBuildingSpec, inferThemeBuildingSize } from "../utils/customBuildingSize";
import { filterAvailableProjectAssets, getAvailableProjectAssets, getThemePackAssets, localizeProjectAsset } from "../data/localAssets";

export const buildingTypes: Record<string, BuildingType> = Object.fromEntries(
  (buildingTypesJson as BuildingType[]).map((bt) => [bt.type, bt])
);

const DEFAULT_GRID = { cols: 192, rows: 192 };
const LAYOUT_SCHEME_SLOTS = [1, 2, 3] as const;
const SYSTEM_SINGLETON_BUILDING_TYPES = new Set([
  "city-hall",
  "skill-market",
  "task-hall",
  "archive",
  "data-center",
  "server-room",
  "theme-hall",
]);
const BUILDING_NAME_ZH: Record<string, string> = {
  "city-hall": "市政大厅",
  "skill-market": "技能大厅",
  archive: "档案馆",
  "data-center": "数据中心",
  "server-room": "服务器机房",
  "theme-hall": "主题大厅",
  "agent-home": "Agent 小屋",
  "task-hall": "待办大厅",
  "custom-link": "自定义建筑",
};
const LEGACY_BUILDING_NAMES = new Set([
  "City Hall",
  "Skill Hall",
  "Skill Market",
  "Archive",
  "Data Center",
  "Server Room",
  "Theme Hall",
  "Agent Home",
  "Task Hall",
  "Custom Building",
]);
const DEFAULT_SYSTEM_BUILDINGS: PlacedBuilding[] = [
  {
    id: "city-hall-1",
    type: "city-hall",
    purpose: "city-hall",
    x: 88,
    y: 82,
    name: "市政大厅",
  },
  {
    id: "skill-hall-1",
    type: "skill-market",
    purpose: "skill-hall",
    x: 76,
    y: 72,
    name: "技能大厅",
  },
  {
    id: "todo-hall-1",
    type: "task-hall",
    purpose: "todo-hall",
    x: 84,
    y: 68,
    name: "待办大厅",
  },
  {
    id: "archive-1",
    type: "archive",
    purpose: "bookmarks",
    x: 70,
    y: 88,
    name: "档案馆",
  },
  {
    id: "data-center-1",
    type: "data-center",
    purpose: "generic",
    x: 68,
    y: 74,
    name: "数据中心",
  },
  {
    id: "server-manager-1",
    type: "server-room",
    purpose: "server-manager",
    x: 108,
    y: 76,
    name: "服务器机房",
  },
  {
    id: "theme-hall-1",
    type: "theme-hall",
    purpose: "theme-hall",
    x: 104,
    y: 92,
    name: "主题大厅",
  },
];

function projectAssetId(kind: CustomSceneAsset["kind"], rel: string): string {
  return `project-${kind}-${rel}`;
}

function placedProjectAsset(
  kind: CustomSceneAsset["kind"],
  rel: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number
): PlacedCustomAsset {
  const slug = rel.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "asset";
  return {
    id: `megalithic-decor-${slug}-${x}-${y}`,
    assetId: projectAssetId(kind, rel),
    kind,
    name,
    url: `/${rel}`,
    x,
    y,
    width,
    height,
  };
}

function createMegalithicDecorPlacedAssets(): PlacedCustomAsset[] {
  const terrain = (rel: string, name: string, positions: Array<[number, number]>) =>
    positions.map(([x, y]) => placedProjectAsset("terrain", rel, name, x, y, TERRAIN_SUBDIV * 2, TERRAIN_SUBDIV * 2));
  const decor = (rel: string, name: string, x: number, y: number, width = 4, height = 4) =>
    placedProjectAsset("decoration", rel, name, x, y, width, height);

  return [
    ...terrain("ground/walkable/tileable/megalithic-decor/plaza-stone-ring.png", "巨石 · 圆形广场砖", [
      [172, 168], [176, 168], [180, 168],
      [172, 172], [176, 172], [180, 172],
      [172, 176], [176, 176], [180, 176],
    ]),
    ...terrain("ground/walkable/tileable/megalithic-decor/broken-stone-path.png", "巨石 · 破碎石板路", [
      [168, 164], [164, 160], [160, 156],
      [184, 164], [188, 160], [192, 156],
      [176, 180], [176, 184], [176, 188],
      [168, 176], [164, 180], [160, 184],
    ]),
    ...terrain("ground/walkable/tileable/megalithic-decor/entrance-semicircle-paving.png", "巨石 · 门口半圆铺装", [
      [176, 158], [154, 148], [142, 178], [216, 152], [208, 186], [136, 150],
    ]),
    ...terrain("ground/walkable/tileable/megalithic-decor/rune-circle-paving.png", "巨石 · 蓝色符文地砖", [
      [150, 144], [136, 146], [216, 150], [214, 154],
    ]),
    ...terrain("ground/walkable/tileable/megalithic-decor/flower-grass-sprinkle.png", "巨石 · 碎花草地", [
      [126, 170], [134, 178], [146, 170], [154, 184],
    ]),
    ...terrain("ground/walkable/tileable/megalithic-decor/wood-plank-walkway.png", "巨石 · 水边木栈道", [
      [236, 214], [240, 218], [54, 142],
    ]),
    ...terrain("ground/walkable/tileable/megalithic-decor/stepping-stones-water-edge.png", "巨石 · 水边踏石", [
      [128, 214], [132, 218], [220, 210],
    ]),
    decor("decorations/blocking/megalithic-decor/crystal-fountain.png", "巨石 · 蓝晶喷泉", 176, 170, 6, 6),
    decor("decorations/blocking/megalithic-decor/crystal-lamp-post.png", "巨石 · 水晶路灯", 166, 164, 3, 5),
    decor("decorations/blocking/megalithic-decor/crystal-lamp-post.png", "巨石 · 水晶路灯", 186, 164, 3, 5),
    decor("decorations/blocking/megalithic-decor/crystal-lamp-post.png", "巨石 · 水晶路灯", 166, 184, 3, 5),
    decor("decorations/blocking/megalithic-decor/crystal-lamp-post.png", "巨石 · 水晶路灯", 190, 184, 3, 5),
    decor("decorations/blocking/megalithic-decor/notice-board.png", "巨石 · 公告栏", 144, 176, 5, 5),
    decor("decorations/blocking/megalithic-decor/wooden-bench.png", "巨石 · 木长椅", 126, 184, 5, 4),
    decor("decorations/blocking/megalithic-decor/wooden-bench.png", "巨石 · 木长椅", 152, 176, 5, 4),
    decor("decorations/blocking/megalithic-decor/campfire-ring.png", "巨石 · 篝火圈", 132, 184, 5, 5),
    decor("decorations/blocking/megalithic-decor/flower-bed.png", "巨石 · 花坛", 140, 166, 5, 4),
    decor("decorations/blocking/megalithic-decor/flower-bed.png", "巨石 · 花坛", 194, 166, 5, 4),
    decor("decorations/blocking/megalithic-decor/flower-bed.png", "巨石 · 花坛", 218, 174, 5, 4),
    decor("decorations/blocking/megalithic-decor/crates-and-barrels.png", "巨石 · 箱桶杂物", 210, 178, 5, 5),
    decor("decorations/blocking/megalithic-decor/scroll-pile.png", "巨石 · 卷轴书堆", 142, 184, 4, 4),
    decor("decorations/blocking/megalithic-decor/tool-cart.png", "巨石 · 工具推车", 196, 196, 5, 5),
    decor("decorations/blocking/megalithic-decor/wooden-dock.png", "巨石 · 木平台", 236, 216, 6, 4),
    decor("decorations/blocking/megalithic-decor/fishing-spot.png", "巨石 · 钓鱼点", 228, 218, 5, 5),
    decor("decorations/blocking/megalithic-decor/signpost.png", "巨石 · 路牌", 160, 164, 3, 5),
    decor("decorations/blocking/megalithic-decor/signpost.png", "巨石 · 路牌", 184, 188, 3, 5),
  ];
}

export const BUILT_IN_THEME_PACKS: ThemePackDefinition[] = [
  {
    id: "theme-megalithic-spring",
    name: "巨石春野",
    kind: "complete",
    icon: "🌿",
    summary: "默认森林、巨石遗迹和青绿色建筑的完整主题包。",
    previewUrl: "/scene-themes/megalithic-spring.png",
    creatorName: "Agent City 官方",
    builtIn: true,
    mapSurrounding: "megalithic",
    buildingSkins: {},
  },
  {
    id: "theme-changan-city",
    name: "长安城",
    kind: "complete",
    icon: "🏮",
    summary: "长安御街地图与宫阙、书院、塔楼、工坊建筑外观。",
    previewUrl: "/scene-themes/changan-city.png",
    creatorName: "长安造景社",
    builtIn: true,
    mapSurrounding: "changan-city",
    buildingSkins: {
      "city-hall": "/buildings/changan-pack/01-city-hall.png",
      "agent-home": "/buildings/changan-pack/02-agent-courtyard.png",
      "task-hall": "/buildings/changan-pack/03-task-notice-hall.png",
      "skill-market": "/buildings/changan-pack/04-skill-academy.png",
      archive: "/buildings/changan-pack/05-archive-pagoda.png",
      "data-center": "/buildings/changan-pack/06-data-observatory.png",
      "server-room": "/buildings/changan-pack/07-server-ops-fort.png",
      "theme-hall": "/buildings/changan-pack/08-lantern-theme-hall.png",
      "custom-link": "/buildings/changan-pack/09-custom-workshop.png",
    },
  },
  {
    id: "theme-sky-observatory",
    name: "天空岛",
    kind: "complete",
    icon: "💎",
    summary: "云海观星台地图与水晶、星象、天空学院建筑外观。",
    previewUrl: "/scene-themes/sky-observatory.png",
    creatorName: "星穹工坊",
    builtIn: true,
    mapSurrounding: "sky-observatory",
    buildingSkins: {
      "city-hall": "/buildings/sky-observatory-pack/01-city-hall.png",
      "agent-home": "/buildings/sky-observatory-pack/02-agent-home.png",
      "task-hall": "/buildings/sky-observatory-pack/03-task-hall.png",
      "skill-market": "/buildings/sky-observatory-pack/04-skill-academy.png",
      archive: "/buildings/sky-observatory-pack/05-archive-rotunda.png",
      "data-center": "/buildings/sky-observatory-pack/06-data-crystal-tower.png",
      "server-room": "/buildings/sky-observatory-pack/07-server-observatory.png",
      "theme-hall": "/buildings/sky-observatory-pack/08-theme-gallery.png",
      "custom-link": "/buildings/sky-observatory-pack/09-custom-workshop.png",
    },
  },
];

function normalizeInstalledThemePacks(
  installedThemePacks: ThemePackDefinition[] | undefined
): ThemePackDefinition[] {
  const officialIds = new Set(BUILT_IN_THEME_PACKS.map((pack) => pack.id));
  const installed = (installedThemePacks ?? []).filter((pack) => pack.installedAt || !officialIds.has(pack.id));
  return installed.map((pack) => {
    const official = BUILT_IN_THEME_PACKS.find((item) => item.id === pack.id);
    return official ? { ...official, ...pack, builtIn: true } : pack;
  });
}

function defaultLayout(): CityLayout {
  return {
    grid: DEFAULT_GRID,
    buildings: DEFAULT_SYSTEM_BUILDINGS,
    decorations: [],
    npcs: {},
    buildingResidents: {
      "city-hall-1": "mayor",
    },
    characterChats: {},
    characterChatSessions: {},
    activeCharacterChatSessionIds: {},
    installedSkillIds: [],
    installedSkills: [],
    skillGroups: [],
    buildingBookmarks: {},
    buildingTasks: {},
    customAssets: getAvailableProjectAssets(normalizeInstalledThemePacks([])),
    placedCustomAssets: createMegalithicDecorPlacedAssets(),
    blockedWalkCells: {},
    blockedWalkResolution: 1,
    mapSurrounding: "megalithic",
    ground: {},
    groundResolution: TERRAIN_SUBDIV,
    cityName: "Agent City",
    managementLanguage: "zh-CN",
    cityLordName: "",
    showBuildingStatusIndicators: true,
    showBuildingLabels: true,
    themeMode: "system",
    timeOfDay: "auto",
    allowNpcOffRoad: false,
    ignoreBuildingCollisionForNpc: false,
    customCharacters: [],
    installedThemePacks: normalizeInstalledThemePacks([]),
    activeThemePackId: null,
    glanceDashboardUrl: "",
    deviceIntegrations: [],
    layoutSchemes: [
      {
        id: "scheme-megalithic-decor-sample",
        name: "巨石春野装饰示意",
        slot: 1,
        updatedAt: "2026-07-12T00:00:00.000Z",
        snapshot: {
          buildings: cloneJson(DEFAULT_SYSTEM_BUILDINGS),
          decorations: [],
          npcs: {},
          buildingResidents: {
            "city-hall-1": "mayor",
          },
          buildingBookmarks: {},
          buildingTasks: {},
          placedCustomAssets: createMegalithicDecorPlacedAssets(),
          mapSurrounding: "megalithic",
          ground: {},
          groundResolution: TERRAIN_SUBDIV,
          blockedWalkCells: {},
          blockedWalkResolution: 1,
        },
      },
    ],
    activeLayoutSchemeId: null,
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeNpcStates(npcs: Record<string, PlacedNpcState> | undefined): Record<string, PlacedNpcState> {
  return Object.fromEntries(
    Object.entries(npcs ?? {}).map(([buildingId, npc]) => [buildingId, {
      presence: npc.presence,
      x: npc.x,
      y: npc.y,
      ...(npc.direction ? { direction: npc.direction } : {}),
      ...(npc.line ? { line: npc.line } : {}),
      ...(npc.mood ? { mood: npc.mood } : {}),
      ...(npc.runtimeStatus ? { runtimeStatus: npc.runtimeStatus } : {}),
    }])
  );
}

function createLayoutSnapshot(state: Pick<
  CityState,
  | "buildings"
  | "decorations"
  | "npcs"
  | "buildingResidents"
  | "buildingBookmarks"
  | "buildingTasks"
  | "placedCustomAssets"
  | "mapSurrounding"
  | "ground"
  | "blockedWalkCells"
>): LayoutSchemeSnapshot {
  return {
    buildings: cloneJson(state.buildings),
    decorations: cloneJson(state.decorations),
    npcs: cloneJson(state.npcs),
    buildingResidents: cloneJson(state.buildingResidents),
    buildingBookmarks: cloneJson(state.buildingBookmarks),
    buildingTasks: cloneJson(state.buildingTasks),
    placedCustomAssets: cloneJson(state.placedCustomAssets),
    mapSurrounding: state.mapSurrounding,
    ground: cloneJson(state.ground),
    groundResolution: TERRAIN_SUBDIV,
    blockedWalkCells: cloneJson(state.blockedWalkCells),
    blockedWalkResolution: 1,
  };
}

function emptyLayoutSnapshot(): LayoutSchemeSnapshot {
  return {
    buildings: [],
    decorations: [],
    npcs: {},
    buildingResidents: {},
    buildingBookmarks: {},
    buildingTasks: {},
    placedCustomAssets: [],
    mapSurrounding: "megalithic",
    ground: {},
    groundResolution: TERRAIN_SUBDIV,
    blockedWalkCells: {},
    blockedWalkResolution: 1,
  };
}

function snapshotToLayoutState(
  snapshot: LayoutSchemeSnapshot,
  customCharacters: NpcDefinition[]
): Partial<CityState> {
  const buildings = resolveOverlappingBuildings(normalizeBuildings(snapshot.buildings ?? []));
  return {
    buildings,
    decorations: snapshot.decorations ?? [],
    npcs: normalizeNpcStates(snapshot.npcs),
    buildingResidents: createDefaultBuildingResidents(
      buildings,
      snapshot.buildingResidents,
      customCharacters
    ),
    buildingBookmarks: snapshot.buildingBookmarks ?? {},
    buildingTasks: snapshot.buildingTasks ?? {},
    placedCustomAssets: normalizePlacedCustomAssets(snapshot.placedCustomAssets),
    blockedWalkCells: normalizeBlockedWalkCells({
      grid: DEFAULT_GRID,
      buildings,
      blockedWalkCells: snapshot.blockedWalkCells,
      blockedWalkResolution: snapshot.blockedWalkResolution,
    }),
    mapSurrounding: snapshot.mapSurrounding ?? "megalithic",
    ground: migrateGround({
      grid: DEFAULT_GRID,
      buildings,
      ground: snapshot.ground,
      groundResolution: snapshot.groundResolution,
    }),
  };
}

function normalizeLayoutSchemes(schemes: LayoutScheme[] | undefined): LayoutScheme[] {
  const bySlot = new Map<number, LayoutScheme>();
  (schemes ?? []).forEach((scheme) => {
    if (!LAYOUT_SCHEME_SLOTS.includes(scheme.slot)) return;
    if (bySlot.has(scheme.slot)) return;
    bySlot.set(scheme.slot, {
      ...scheme,
      id: scheme.id || `scheme-${scheme.slot}`,
      name: scheme.name || `方案 ${scheme.slot}`,
      snapshot: cloneJson(scheme.snapshot),
    });
  });
  return Array.from(bySlot.values()).sort((a, b) => a.slot - b.slot);
}

function persistAgentConfig(characterId: string, config: CharacterRuntimeConfig) {
  void saveAgentConfig(characterId, config).catch(() => {
    // The web app can still run against localStorage without the Fastify server.
  });
}

function reconcileSkillHallManagedWorkspaces(
  buildings: PlacedBuilding[],
  buildingResidents: Record<string, string>,
  characterConfigs: Record<string, CharacterRuntimeConfig>,
): { characterConfigs: Record<string, CharacterRuntimeConfig>; changedCharacterIds: string[] } {
  const skillManagerIds = new Set(
    buildings
      .filter((building) => getBuildingPurpose(building) === "skill-hall")
      .map((building) => buildingResidents[building.id])
      .filter((characterId): characterId is string => Boolean(characterId))
  );
  const changedCharacterIds: string[] = [];
  const nextConfigs = Object.fromEntries(
    Object.entries(characterConfigs).map(([characterId, config]) => {
      const managedWorkspace = skillManagerIds.has(characterId) ? "city-skills" as const : undefined;
      if (config.managedWorkspace === managedWorkspace) return [characterId, config];
      changedCharacterIds.push(characterId);
      return [characterId, { ...config, managedWorkspace }];
    })
  );
  return { characterConfigs: nextConfigs, changedCharacterIds };
}

function syncSkillHallManagedWorkspaces(
  set: (patch: Partial<CityState>) => void,
  get: () => CityState,
): void {
  const state = get();
  const reconciled = reconcileSkillHallManagedWorkspaces(
    state.buildings,
    state.buildingResidents,
    state.characterConfigs,
  );
  if (!reconciled.changedCharacterIds.length) return;
  set({ characterConfigs: reconciled.characterConfigs });
  reconciled.changedCharacterIds.forEach((characterId) => {
    persistAgentConfig(characterId, reconciled.characterConfigs[characterId]);
  });
}

function createCityContextSnapshot(state: CityState, requesterCharacterId: string) {
  const canReadCity =
    state.characterConfigs[requesterCharacterId]?.permissions?.cityDataReadonly ||
    requesterCharacterId === "mayor";
  if (!canReadCity) return null;
  return {
    cityName: state.cityName,
    cityLordName: state.cityLordName,
    managementLanguage: state.managementLanguage,
    buildings: state.buildings.map((building) => ({
      id: building.id,
      name: building.name,
      type: building.type,
      purpose: getBuildingPurpose(building),
      residentId: state.buildingResidents[building.id] ?? null,
    })),
    skillsByAgent: Object.fromEntries(
      Object.entries(state.characterConfigs).map(([characterId, config]) => [
        characterId,
        (config.learnedSkills ?? []).map((skill) => ({
          id: skill.id,
          name: skill.name,
          enabled: config.skillEnabledById?.[skill.id] ?? true,
        })),
      ])
    ),
    display: {
      showBuildingStatusIndicators: state.showBuildingStatusIndicators,
      showBuildingLabels: state.showBuildingLabels,
    },
  };
}

function mergeCustomAssets(...assetGroups: Array<CustomSceneAsset[] | undefined>): CustomSceneAsset[] {
  const next = new Map<string, CustomSceneAsset>();
  for (const group of assetGroups) {
    for (const asset of group ?? []) next.set(asset.id, asset);
  }
  return Array.from(next.values());
}

function groundKey(x: number, y: number): string {
  return `${x},${y}`;
}

function snapTerrainCoordinate(value: number): number {
  return Math.floor(value / TERRAIN_SUBDIV) * TERRAIN_SUBDIV;
}

function isPathCell(point: { x: number; y: number }, ground: Record<string, TerrainType>): boolean {
  return ground[groundKey(point.x, point.y)] === "stone";
}

function placedAssetCoversPoint(asset: PlacedCustomAsset, point: { x: number; y: number }): boolean {
  return (
    point.x >= asset.x &&
    point.x < asset.x + asset.width &&
    point.y >= asset.y &&
    point.y < asset.y + asset.height
  );
}

function footprintCenterInBuildableArea(
  x: number,
  y: number,
  size: [number, number],
  grid: { cols: number; rows: number },
  mapSurrounding: MapSurrounding
): boolean {
  void x; void y; void size; void grid; void mapSurrounding;
  return true;
}

function terrainFootprintCenterInBuildableArea(
  x: number,
  y: number,
  size: { width: number; height: number },
  grid: { cols: number; rows: number },
  mapSurrounding: MapSurrounding
): boolean {
  void x; void y; void size; void grid; void mapSurrounding;
  return true;
}

function decorationOverlapsBuilding(
  x: number,
  y: number,
  building: PlacedBuilding,
  buildingTypes: Record<string, BuildingType>
): boolean {
  const size = getPlacedBuildingSize(building, buildingTypes);
  const buildingX = building.x * TERRAIN_SUBDIV;
  const buildingY = building.y * TERRAIN_SUBDIV;
  return (
    x >= buildingX &&
    x < buildingX + size[0] * TERRAIN_SUBDIV &&
    y >= buildingY &&
    y < buildingY + size[1] * TERRAIN_SUBDIV
  );
}

function decorationOverlapsBuildingArea(
  decoration: PlacedDecoration,
  x: number,
  y: number,
  size: [number, number]
): boolean {
  const areaX = x * TERRAIN_SUBDIV;
  const areaY = y * TERRAIN_SUBDIV;
  return (
    decoration.x >= areaX &&
    decoration.x < areaX + size[0] * TERRAIN_SUBDIV &&
    decoration.y >= areaY &&
    decoration.y < areaY + size[1] * TERRAIN_SUBDIV
  );
}

function placedAssetOverlapsBuildingArea(
  asset: PlacedCustomAsset,
  x: number,
  y: number,
  size: [number, number]
): boolean {
  const areaX = x * TERRAIN_SUBDIV;
  const areaY = y * TERRAIN_SUBDIV;
  const areaW = size[0] * TERRAIN_SUBDIV;
  const areaH = size[1] * TERRAIN_SUBDIV;
  return (
    asset.x < areaX + areaW &&
    asset.x + asset.width > areaX &&
    asset.y < areaY + areaH &&
    asset.y + asset.height > areaY
  );
}

function placedAssetsOverlap(a: PlacedCustomAsset, b: PlacedCustomAsset): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function buildingCoversTerrainPoint(
  building: PlacedBuilding,
  point: { x: number; y: number }
): boolean {
  const NPC_BUILDING_CLEARANCE = 1;
  const size = getPlacedBuildingSize(building, buildingTypes);
  const x = building.x * TERRAIN_SUBDIV - NPC_BUILDING_CLEARANCE;
  const y = building.y * TERRAIN_SUBDIV - NPC_BUILDING_CLEARANCE;
  return (
    point.x >= x &&
    point.x < x + size[0] * TERRAIN_SUBDIV + NPC_BUILDING_CLEARANCE * 2 &&
    point.y >= y &&
    point.y < y + size[1] * TERRAIN_SUBDIV + NPC_BUILDING_CLEARANCE * 2
  );
}

function isWalkableTerrainPoint(
  point: { x: number; y: number },
  state: Pick<
    CityState,
    "ground" | "placedCustomAssets" | "decorations" | "buildings" | "allowNpcOffRoad" | "ignoreBuildingCollisionForNpc"
    | "blockedWalkCells"
  >
): boolean {
  if (state.blockedWalkCells[groundKey(Math.floor(point.x / TERRAIN_SUBDIV), Math.floor(point.y / TERRAIN_SUBDIV))]) {
    return false;
  }
  const hasWalkableDecal = state.placedCustomAssets.some(
    (asset) => asset.kind === "terrain" && placedAssetCoversPoint(asset, point)
  );
  const legacyPath = isPathCell(point, state.ground);
  if (!state.allowNpcOffRoad && !hasWalkableDecal && !legacyPath) return false;
  const blockedByPlacedAsset = state.placedCustomAssets.some(
    (asset) => asset.kind === "decoration" && placedAssetCoversPoint(asset, point)
  );
  if (blockedByPlacedAsset) return false;
  const blockedByLegacyDecoration = state.decorations.some(
    (decoration) => decoration.x === point.x && decoration.y === point.y
  );
  if (blockedByLegacyDecoration) return false;
  return state.ignoreBuildingCollisionForNpc
    ? true
    : !state.buildings.some((building) => buildingCoversTerrainPoint(building, point));
}

function preferredNpcDirectionRandom(direction: PlacedNpcState["direction"]): number {
  if (direction && Math.random() < 0.72) {
    return direction === "right" ? 0.01 : direction === "left" ? 0.26 : direction === "down" ? 0.51 : 0.76;
  }
  return Math.random();
}

function findNpcSpawnPoint(
  home: { x: number; y: number },
  size: [number, number],
  grid: { cols: number; rows: number },
  state: Pick<
    CityState,
    "ground" | "placedCustomAssets" | "decorations" | "buildings" | "allowNpcOffRoad" | "ignoreBuildingCollisionForNpc"
    | "blockedWalkCells"
  >
) {
  const isWalkable = (point: { x: number; y: number }) => isWalkableTerrainPoint(point, state);
  const spawn = createNpcSpawn(home, size, grid, isWalkable);
  if (spawn) return spawn;

  const center = {
    x: home.x + Math.floor(size[0] / 2),
    y: home.y + Math.floor(size[1] / 2),
  };
  const maxRadius = Math.max(grid.cols, grid.rows);
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let y = center.y - radius; y <= center.y + radius; y++) {
      for (let x = center.x - radius; x <= center.x + radius; x++) {
        if (Math.max(Math.abs(x - center.x), Math.abs(y - center.y)) !== radius) continue;
        const point = {
          x: Math.max(0, Math.min(grid.cols - 1, x)),
          y: Math.max(0, Math.min(grid.rows - 1, y)),
        };
        if (isWalkable(point)) return point;
      }
    }
  }
  return null;
}

function normalizeBuildings(buildings: PlacedBuilding[]): PlacedBuilding[] {
  const seenSystemPurposes = new Set<BuildingPurpose>();
  return buildings.map((legacyBuilding) => {
    const { url: _legacyUrl, ...building } = legacyBuilding as PlacedBuilding & { url?: unknown };
    const purpose = building.purpose ?? inferBuildingPurpose(building.type);
    const nextPurpose = isSystemPurpose(purpose)
      ? seenSystemPurposes.has(purpose)
        ? "generic"
        : purpose
      : purpose;
    if (isSystemPurpose(nextPurpose)) seenSystemPurposes.add(nextPurpose);
    const inferredThemeSize = inferThemeBuildingSize(building.customImageUrl);
    const hasLegacyCustomSize = building.size?.[0] === 2 && building.size?.[1] === 2;
    const nextBuilding = {
      ...building,
      purpose: nextPurpose,
      size:
        inferredThemeSize && hasLegacyCustomSize
          ? inferredThemeSize
          : building.size ??
            (building.customImageUrl || building.customAssetId ? inferredThemeSize ?? DEFAULT_CUSTOM_BUILDING_SIZE : undefined),
    };
    if (LEGACY_BUILDING_NAMES.has(nextBuilding.name) && BUILDING_NAME_ZH[nextBuilding.type]) {
      return { ...nextBuilding, name: BUILDING_NAME_ZH[nextBuilding.type] };
    }
    return nextBuilding;
  });
}

function resolveOverlappingBuildings(buildings: PlacedBuilding[]): PlacedBuilding[] {
  const placed: PlacedBuilding[] = [];
  for (const building of buildings) {
    const size = getPlacedBuildingSize(building, buildingTypes);
    if (canPlace(building.x, building.y, size, DEFAULT_GRID, placed, buildingTypes)) {
      placed.push(building);
      continue;
    }
    let resolved: PlacedBuilding | null = null;
    for (let radius = 1; radius <= 80 && !resolved; radius += 1) {
      for (let dx = -radius; dx <= radius && !resolved; dx += 1) {
        for (const dy of [-radius, radius]) {
          const x = Math.max(0, Math.min(DEFAULT_GRID.cols - size[0], building.x + dx));
          const y = Math.max(0, Math.min(DEFAULT_GRID.rows - size[1], building.y + dy));
          if (canPlace(x, y, size, DEFAULT_GRID, placed, buildingTypes)) resolved = { ...building, x, y };
        }
      }
      for (let dy = -radius + 1; dy < radius && !resolved; dy += 1) {
        for (const dx of [-radius, radius]) {
          const x = Math.max(0, Math.min(DEFAULT_GRID.cols - size[0], building.x + dx));
          const y = Math.max(0, Math.min(DEFAULT_GRID.rows - size[1], building.y + dy));
          if (canPlace(x, y, size, DEFAULT_GRID, placed, buildingTypes)) resolved = { ...building, x, y };
        }
      }
    }
    placed.push(resolved ?? building);
  }
  return placed;
}

function placedCustomBuildingToBuilding(asset: PlacedCustomAsset): PlacedBuilding {
  return {
    id: `custom-building-${asset.id}`,
    type: "custom-link",
    purpose: "generic",
    x: Math.max(0, Math.floor(asset.x / TERRAIN_SUBDIV)),
    y: Math.max(0, Math.floor(asset.y / TERRAIN_SUBDIV)),
    name: asset.name,
    customAssetId: asset.assetId,
    customImageUrl: asset.url,
    size: getCustomBuildingSize(asset.url),
  };
}

function ensureDefaultSystemBuildings(
  buildings: PlacedBuilding[],
  grid: { cols: number; rows: number }
): PlacedBuilding[] {
  const next = [...buildings];
  for (const template of DEFAULT_SYSTEM_BUILDINGS) {
    const purpose = getBuildingPurpose(template);
    if (next.some((building) => getBuildingPurpose(building) === purpose)) continue;
    const bt = buildingTypes[template.type];
    if (!bt) continue;
    const candidatePositions = [
      { x: template.x, y: template.y },
      ...Array.from({ length: grid.rows * grid.cols }, (_, index) => ({
        x: index % grid.cols,
        y: Math.floor(index / grid.cols),
      })),
    ];
    const position = candidatePositions.find((candidate) =>
      canPlace(candidate.x, candidate.y, bt.size, grid, next, buildingTypes)
    );
    if (!position) continue;
    const id = next.some((building) => building.id === template.id)
      ? `${template.id}-${next.length + 1}`
      : template.id;
    next.push({ ...template, id, x: position.x, y: position.y });
  }
  return next;
}

function createSessionId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "agent";
}

type ParsedTaskCommand =
  | { action: "add"; title: string }
  | { action: "status"; title: string; status: BuildingTaskStatus }
  | { action: "delete"; title: string };

function cleanupTaskTitle(value: string): string {
  return value
    .replace(/^[：:\s，,。.\-—]+/, "")
    .replace(/[。.\s]+$/, "")
    .replace(/^(这个|这件|任务|待办)\s*/, "")
    .trim();
}

function parseTaskCommand(content: string): ParsedTaskCommand | null {
  const text = content.trim();
  const addMatch = text.match(/^(?:添加|新增|创建|加一个|加到|加入)(?:一个)?(?:任务|待办|todo)?[：:\s]*(.+)$/i);
  if (addMatch) {
    const title = cleanupTaskTitle(addMatch[1]);
    return title ? { action: "add", title } : null;
  }

  const putTodoMatch = text.match(/^把(.+?)(?:加入|加到|放到)(?:任务|待办|todo)(?:里|列表)?$/i);
  if (putTodoMatch) {
    const title = cleanupTaskTitle(putTodoMatch[1]);
    return title ? { action: "add", title } : null;
  }

  const doneMatch =
    text.match(/^(?:完成|做完|结束|标记完成|标记为完成)[：:\s]*(.+)$/i) ??
    text.match(/^把(.+?)(?:标记为|改成|设为)?(?:完成|已完成|done)$/i);
  if (doneMatch) {
    const title = cleanupTaskTitle(doneMatch[1]);
    return title ? { action: "status", title, status: "done" } : null;
  }

  const doingMatch =
    text.match(/^(?:开始|开始做|处理|开工|进行中|标记进行中|标记为进行中)[：:\s]*(.+)$/i) ??
    text.match(/^把(.+?)(?:标记为|改成|设为)?(?:进行中|开始做|doing)$/i);
  if (doingMatch) {
    const title = cleanupTaskTitle(doingMatch[1]);
    return title ? { action: "status", title, status: "doing" } : null;
  }

  const todoMatch =
    text.match(/^(?:暂停|放回待办|标记待办|标记为待办)[：:\s]*(.+)$/i) ??
    text.match(/^把(.+?)(?:标记为|改成|设为)?(?:待办|todo)$/i);
  if (todoMatch) {
    const title = cleanupTaskTitle(todoMatch[1]);
    return title ? { action: "status", title, status: "todo" } : null;
  }

  const inboxMatch =
    text.match(/^(?:放回收件箱|放回inbox|标记inbox|标记为inbox)[：:\s]*(.+)$/i) ??
    text.match(/^把(.+?)(?:标记为|改成|设为)?(?:inbox|收件箱)$/i);
  if (inboxMatch) {
    const title = cleanupTaskTitle(inboxMatch[1]);
    return title ? { action: "status", title, status: "inbox" } : null;
  }

  const deleteMatch = text.match(/^(?:删除|移除|取消)(?:任务|待办)?[：:\s]*(.+)$/i);
  if (deleteMatch) {
    const title = cleanupTaskTitle(deleteMatch[1]);
    return title ? { action: "delete", title } : null;
  }

  return null;
}

function findTaskByTitle(tasks: BuildingTask[], title: string): BuildingTask | null {
  const needle = title.toLowerCase();
  return (
    tasks.find((task) => task.title.toLowerCase() === needle) ??
    tasks.find((task) => task.title.toLowerCase().includes(needle)) ??
    tasks.find((task) => needle.includes(task.title.toLowerCase())) ??
    null
  );
}

function taskStatusLabel(status: BuildingTaskStatus): string {
  if (status === "inbox") return "Inbox";
  if (status === "doing") return "进行中";
  if (status === "done") return "完成";
  return "待办";
}

function migrateCharacterChatSessions(
  layout: CityLayout
): {
  characterChatSessions: Record<string, CharacterChatSession[]>;
  activeCharacterChatSessionIds: Record<string, string>;
} {
  const sessions: Record<string, CharacterChatSession[]> = { ...(layout.characterChatSessions ?? {}) };
  const activeIds: Record<string, string> = { ...(layout.activeCharacterChatSessionIds ?? {}) };
  for (const [characterId, legacyMessages] of Object.entries(layout.characterChats ?? {})) {
    if (!legacyMessages.length || sessions[characterId]?.length) continue;
    const first = legacyMessages[0];
    const last = legacyMessages[legacyMessages.length - 1];
    const session: CharacterChatSession = {
      id: createSessionId(),
      title: first.content.slice(0, 28) || "新对话",
      messages: legacyMessages,
      createdAt: first.createdAt,
      updatedAt: last.createdAt,
    };
    sessions[characterId] = [session];
    activeIds[characterId] = session.id;
  }
  for (const [characterId, characterSessions] of Object.entries(sessions)) {
    if (!activeIds[characterId] && characterSessions[0]) {
      activeIds[characterId] = characterSessions[0].id;
    }
  }
  return { characterChatSessions: sessions, activeCharacterChatSessionIds: activeIds };
}

/**
 * Ground used to be painted at 1 tile per building cell. Terrain now paints
 * at TERRAIN_SUBDIV x TERRAIN_SUBDIV sub-cells per building cell instead
 * (so path/water render nearer their native size). Layouts saved before
 * this existed have no groundResolution, or an older/coarser one - expand
 * each of their cells into a same-terrain block in the new coordinate
 * space so already-painted ground doesn't visually shift or shrink.
 */
function migrateGround(layout: CityLayout): Record<string, TerrainType> {
  const ground = layout.ground ?? {};
  const resolution = layout.groundResolution ?? 1;
  if (resolution >= TERRAIN_SUBDIV) return ground;
  const scale = TERRAIN_SUBDIV / resolution;
  const migrated: Record<string, TerrainType> = {};
  for (const [key, terrain] of Object.entries(ground)) {
    const [ox, oy] = key.split(",").map(Number);
    for (let dx = 0; dx < scale; dx++) {
      for (let dy = 0; dy < scale; dy++) {
        migrated[groundKey(ox * scale + dx, oy * scale + dy)] = terrain;
      }
    }
  }
  return migrated;
}

function normalizeBlockedWalkCells(layout: CityLayout): Record<string, true> {
  const cells = layout.blockedWalkCells ?? {};
  const scale = layout.blockedWalkResolution === 1 ? 1 : TERRAIN_SUBDIV;
  const next: Record<string, true> = {};
  for (const key of Object.keys(cells)) {
    const [x, y] = key.split(",").map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const gridX = Math.floor(x / scale);
    const gridY = Math.floor(y / scale);
    if (gridX < 0 || gridY < 0 || gridX >= DEFAULT_GRID.cols || gridY >= DEFAULT_GRID.rows) continue;
    next[groundKey(gridX, gridY)] = true;
  }
  return next;
}

function keepCurrentPlacedAsset(asset: PlacedCustomAsset): boolean {
  if (asset.url.startsWith("data:")) return true;
  if (asset.kind === "terrain") return asset.url.includes("/ground/walkable/");
  if (asset.kind === "decoration") return asset.url.includes("/decorations/blocking/");
  return asset.url.includes("/buildings/megalithic-single-pack/");
}

function normalizePlacedCustomAssets(assets: PlacedCustomAsset[] | undefined): PlacedCustomAsset[] {
  return (assets ?? []).filter(keepCurrentPlacedAsset).map(({ rotation: _legacyRotation, ...asset }) => asset);
}

interface CityState {
  grid: { cols: number; rows: number };
  buildings: PlacedBuilding[];
  decorations: PlacedDecoration[];
  npcs: Record<string, PlacedNpcState>;
  buildingResidents: Record<string, string>;
  characterConfigs: Record<string, CharacterRuntimeConfig>;
  customCharacters: NpcDefinition[];
  characterChats: Record<string, CharacterChatMessage[]>;
  characterChatSessions: Record<string, CharacterChatSession[]>;
  activeCharacterChatSessionIds: Record<string, string>;
  installedSkillIds: string[];
  installedSkills: SkillDefinition[];
  skillGroups: SkillGroup[];
  buildingBookmarks: Record<string, BookmarkGroup[]>;
  buildingTasks: Record<string, BuildingTask[]>;
  customAssets: CustomSceneAsset[];
  placedCustomAssets: PlacedCustomAsset[];
  blockedWalkCells: Record<string, true>;
  activeCustomAssetId: string | null;
  mapSurrounding: MapSurrounding;
  ground: Record<string, TerrainType>;
  cityName: string;
  managementLanguage: string;
  cityLordName: string;
  showBuildingStatusIndicators: boolean;
  showBuildingLabels: boolean;
  themeMode: AppThemeMode;
  timeOfDay: CityTimeOfDay;
  allowNpcOffRoad: boolean;
  ignoreBuildingCollisionForNpc: boolean;
  installedThemePacks: ThemePackDefinition[];
  activeThemePackId: string | null;
  glanceDashboardUrl: string;
  deviceIntegrations: DeviceIntegration[];
  layoutSchemes: LayoutScheme[];
  activeLayoutSchemeId: string | null;
  layoutSchemeModalOpen: boolean;
  editingLayoutSchemeId: string | null;
  layoutEditBaseline: LayoutSchemeSnapshot | null;
  layoutEditDirty: boolean;
  buildMode: boolean;
  buildPreviewMode: boolean;
  selectedId: string | null;
  activeTerrain: TerrainType | null;
  activeDecoration: DecorationType | null;
  skillHallOpen: boolean;
  settingsOpen: boolean;
  cityHallOpen: boolean;
  serverDashboardOpen: boolean;
  themeHallOpen: boolean;
  todoHallOpen: boolean;
  characterLibraryBuildingId: string | null;
  characterConfigCharacterId: string | null;
  characterChatCharacterId: string | null;
  bookmarkManagerBuildingId: string | null;
  chatStatus: "idle" | "sending" | "error";
  chatError: string | null;
  launchToast: string | null;
  saveStatus: "idle" | "saving" | "saved" | "error";
  configuredSecretKeys: string[];
  skillLearningProgress: { active: boolean; label: string; percent: number };

  init: () => Promise<void>;
  refreshSecretStatus: () => Promise<void>;
  openLayoutSchemeModal: () => void;
  closeLayoutSchemeModal: () => void;
  enterCurrentLayoutBuildMode: () => void;
  editLayoutScheme: (schemeId: string) => void;
  startBlankLayoutScheme: (slot: 1 | 2 | 3) => void;
  saveCurrentLayoutToScheme: (slot: 1 | 2 | 3) => Promise<void>;
  saveEditingLayoutScheme: () => Promise<void>;
  activateLayoutScheme: (schemeId: string) => void;
  discardLayoutEdits: () => void;
  clearCurrentLayoutDraft: () => void;
  toggleBuildMode: () => void;
  toggleBuildPreviewMode: () => void;
  selectBuilding: (id: string | null) => void;
  placeBuilding: (type: string, x: number, y: number) => void;
  moveBuilding: (id: string, x: number, y: number) => boolean;
  removeBuilding: (id: string) => void;
  updateBuilding: (id: string, patch: Partial<Pick<PlacedBuilding, "name" | "purpose" | "type" | "customAssetId" | "customImageUrl" | "size">>) => void;
  resizeBuilding: (id: string, size: [number, number]) => boolean;
  canPlaceAt: (type: string, x: number, y: number, ignoreId?: string) => boolean;
  setActiveTerrain: (terrain: TerrainType | null) => void;
  paintGround: (x: number, y: number) => void;
  setActiveDecoration: (decoration: DecorationType | null) => void;
  placeDecoration: (type: DecorationType, x: number, y: number) => void;
  removeDecoration: (id: string) => void;
  upsertCustomAssets: (assets: CustomSceneAsset[]) => void;
  selectCustomAsset: (assetId: string | null) => void;
  placeCustomAsset: (assetId: string, x: number, y: number) => void;
  placeCustomAssetInstance: (
    assetId: string,
    x: number,
    y: number,
    options: { width: number; height: number }
  ) => boolean;
  moveCustomAsset: (id: string, x: number, y: number) => void;
  resizeCustomAsset: (id: string, width: number, height: number) => boolean;
  removeCustomAsset: (id: string) => void;
  eraseTerrainAt: (x: number, y: number) => void;
  clearAllTerrainTiles: () => void;
  toggleBlockedWalkCell: (x: number, y: number, mode: "block" | "unblock") => void;
  clearBlockedWalkCells: () => void;
  clearScenePaint: () => void;
  setMapSurrounding: (surrounding: MapSurrounding) => void;
  openCharacterLibrary: (buildingId: string) => void;
  closeCharacterLibrary: () => void;
  createCharacter: (input: {
    name: string;
    role: string;
    defaultBuildingType: string;
    personality: string;
    templateCharacterId: string;
  }) => string;
  openCharacterConfig: (characterId: string) => void;
  closeCharacterConfig: () => void;
  updateCharacterBrain: (characterId: string, patch: Partial<AiBrainConfig>) => void;
  updateCharacterPermissions: (characterId: string, patch: Partial<AgentPermissions> & { workspaceRoot?: string }) => void;
  updateCharacterDisplayName: (characterId: string, displayName: string) => void;
  updateCharacterCoreFile: (characterId: string, file: keyof CharacterCoreFiles, value: string) => void;
  updateCharacterSkillEnabled: (characterId: string, skillId: string, enabled: boolean) => void;
  updateCharacterSchedule: (characterId: string, patch: Partial<AgentWorkSchedule>) => void;
  addCharacterTimedTask: (characterId: string, title: string) => void;
  updateCharacterTimedTask: (characterId: string, taskId: string, patch: Partial<AgentTimedTask>) => void;
  removeCharacterTimedTask: (characterId: string, taskId: string) => void;
  resetCharacterConfig: (characterId: string) => void;
  openCharacterChat: (characterId: string) => void;
  closeCharacterChat: () => void;
  openBookmarkManager: (buildingId: string) => void;
  closeBookmarkManager: () => void;
  updateBuildingBookmarks: (buildingId: string, groups: BookmarkGroup[]) => void;
  addBuildingTask: (buildingId: string, title: string, status?: BuildingTaskStatus) => void;
  updateBuildingTask: (
    buildingId: string,
    taskId: string,
    patch: Partial<Pick<BuildingTask, "title" | "note" | "status">>
  ) => void;
  removeBuildingTask: (buildingId: string, taskId: string) => void;
  createCharacterChatSession: (characterId: string) => void;
  selectCharacterChatSession: (characterId: string, sessionId: string) => void;
  toggleCharacterChatSessionPinned: (characterId: string, sessionId: string) => void;
  deleteCharacterChatSession: (characterId: string, sessionId: string) => Promise<void>;
  markCharacterChatRunCancelled: (runId: string) => void;
  syncScheduledChatMessages: (characterId: string) => Promise<void>;
  sendCharacterChatMessage: (characterId: string, content: string, attachments?: ChatAttachment[]) => Promise<void>;
  assignResident: (buildingId: string, characterId: string | null) => void;
  sendNpcWalking: (buildingId: string) => void;
  returnNpcHome: (buildingId: string) => void;
  stepWalkingNpcs: () => void;
  openSkillHall: () => void;
  closeSkillHall: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  openCityHall: () => void;
  closeCityHall: () => void;
  openServerDashboard: () => void;
  closeServerDashboard: () => void;
  openThemeHall: () => void;
  closeThemeHall: () => void;
  openTodoHall: () => void;
  closeTodoHall: () => void;
  installSkill: (skillId: string) => void;
  addInstalledSkill: (skill: SkillDefinition) => void;
  updateInstalledSkill: (skillId: string, patch: Partial<SkillDefinition>) => void;
  removeInstalledSkill: (skillId: string) => Promise<void>;
  createSkillGroup: (name: string) => string;
  renameSkillGroup: (groupId: string, name: string) => void;
  removeSkillGroup: (groupId: string) => void;
  assignSkillToGroup: (skillId: string, groupId: string | null) => void;
  installUrlSkillForCharacters: (characterIds: string[], skill: Parameters<typeof installSkillForAgentFiles>[1]) => Promise<void>;
  showLaunchToast: (message: string) => void;
  setCityName: (name: string) => void;
  setManagementLanguage: (language: string) => void;
  setCityLordName: (name: string) => void;
  setShowBuildingStatusIndicators: (show: boolean) => void;
  setShowBuildingLabels: (show: boolean) => void;
  setThemeMode: (mode: AppThemeMode) => void;
  setTimeOfDay: (timeOfDay: CityTimeOfDay) => void;
  setNpcMovementOptions: (patch: Partial<Pick<CityState, "allowNpcOffRoad" | "ignoreBuildingCollisionForNpc">>) => void;
  setGlanceDashboardUrl: (url: string) => void;
  addDeviceIntegration: (device: Pick<DeviceIntegration, "name" | "url">) => void;
  updateDeviceIntegration: (id: string, patch: Partial<DeviceIntegration>) => void;
  removeDeviceIntegration: (id: string) => void;
  installThemePack: (pack: ThemePackDefinition) => void;
  save: () => Promise<void>;
  replaceLayout: (layout: CityLayout) => void;
  exportCurrent: () => CityLayout;
}

export const useCityStore = create<CityState>((set, get) => ({
  grid: DEFAULT_GRID,
  buildings: [],
  decorations: [],
  npcs: {},
  buildingResidents: {},
  characterConfigs: createDefaultCharacterConfigs(),
  customCharacters: [],
  characterChats: {},
  characterChatSessions: {},
  activeCharacterChatSessionIds: {},
  installedSkillIds: [],
  installedSkills: [],
  skillGroups: [],
  buildingBookmarks: {},
  buildingTasks: {},
  customAssets: [],
  placedCustomAssets: [],
  blockedWalkCells: {},
  activeCustomAssetId: null,
  mapSurrounding: "megalithic",
  ground: {},
  cityName: "Agent City",
  managementLanguage: "zh-CN",
  cityLordName: "",
  showBuildingStatusIndicators: true,
  showBuildingLabels: true,
  themeMode: "system",
  timeOfDay: "auto",
  allowNpcOffRoad: false,
  ignoreBuildingCollisionForNpc: false,
  installedThemePacks: normalizeInstalledThemePacks([]),
  activeThemePackId: null,
  glanceDashboardUrl: "",
  deviceIntegrations: [],
  layoutSchemes: [],
  activeLayoutSchemeId: null,
  layoutSchemeModalOpen: false,
  editingLayoutSchemeId: null,
  layoutEditBaseline: null,
  layoutEditDirty: false,
  buildMode: false,
  buildPreviewMode: false,
  selectedId: null,
  activeTerrain: null,
  activeDecoration: null,
  skillHallOpen: false,
  settingsOpen: false,
  cityHallOpen: false,
  serverDashboardOpen: false,
  themeHallOpen: false,
  todoHallOpen: false,
  characterLibraryBuildingId: null,
  characterConfigCharacterId: null,
  characterChatCharacterId: null,
  bookmarkManagerBuildingId: null,
  chatStatus: "idle",
  chatError: null,
  launchToast: null,
  saveStatus: "idle",
  configuredSecretKeys: [],
  skillLearningProgress: { active: false, label: "", percent: 0 },

  init: async () => {
    const layout = (await loadLayout()) ?? defaultLayout();
    const installedThemePacks = normalizeInstalledThemePacks(layout.installedThemePacks);
    const legacyScale = layout.grid.cols < DEFAULT_GRID.cols ? 2 : 1;
    const secrets = await listSecrets();
    const agentConfigs = await listAgentConfigs();
    const customCharacters = layout.customCharacters ?? [];
    const layoutSchemes = normalizeLayoutSchemes(layout.layoutSchemes);
    const activeLayoutSchemeId = layout.activeLayoutSchemeId ?? null;
    const activeLayoutScheme = activeLayoutSchemeId
      ? layoutSchemes.find((scheme) => scheme.id === activeLayoutSchemeId)
      : null;
    // First-run / still-empty cities start in Build Mode so the building
    // Keep the core city buildings visible immediately on first launch.
    // with no obvious next step. Once something's been placed, respect
    // whatever the user last had (each session starts in view mode).
    const migratedCustomBuildings = (layout.placedCustomAssets ?? [])
      .filter((asset) => asset.kind === "building")
      .map(placedCustomBuildingToBuilding);
    const normalizedBuildings = normalizeBuildings([...layout.buildings, ...migratedCustomBuildings]).map((building, index) => {
      if (legacyScale === 1) return building;
      const columns = [58, 78, 98, 118];
      const rows = [58, 80, 102];
      return { ...building, x: columns[index % columns.length], y: rows[Math.floor(index / columns.length) % rows.length] };
    });
    const buildingsBeforeCollisionRepair = ensureDefaultSystemBuildings(normalizedBuildings, DEFAULT_GRID);
    const buildings = resolveOverlappingBuildings(buildingsBeforeCollisionRepair);
    const activeLayoutState = activeLayoutScheme
      ? snapshotToLayoutState(activeLayoutScheme.snapshot, customCharacters)
      : null;
    const effectiveBuildings = activeLayoutState?.buildings ?? buildings;
    const isEssentiallyEmpty = effectiveBuildings.length <= 1;
    const { characterChatSessions, activeCharacterChatSessionIds } =
      migrateCharacterChatSessions(layout);
    const buildingResidents =
      activeLayoutState?.buildingResidents ??
      createDefaultBuildingResidents(buildings, layout.buildingResidents, customCharacters);
    const reconciledConfigs = reconcileSkillHallManagedWorkspaces(
      effectiveBuildings,
      buildingResidents,
      createDefaultCharacterConfigs({ ...layout.characterConfigs, ...agentConfigs }, customCharacters),
    );
    set({
      grid: DEFAULT_GRID,
      buildings: effectiveBuildings,
      decorations: activeLayoutState?.decorations ?? layout.decorations ?? [],
      npcs: normalizeNpcStates(activeLayoutState?.npcs ?? layout.npcs),
      buildingResidents,
      characterConfigs: reconciledConfigs.characterConfigs,
      customCharacters,
      characterChats: {},
      characterChatSessions,
      activeCharacterChatSessionIds,
      installedSkillIds: layout.installedSkillIds ?? [],
      installedSkills: layout.installedSkills ?? [],
      skillGroups: layout.skillGroups ?? [],
      buildingBookmarks: activeLayoutState?.buildingBookmarks ?? layout.buildingBookmarks ?? {},
      buildingTasks: activeLayoutState?.buildingTasks ?? layout.buildingTasks ?? {},
      customAssets: mergeCustomAssets(
        getAvailableProjectAssets(installedThemePacks),
        filterAvailableProjectAssets(layout.customAssets ?? [], installedThemePacks)
      ),
      placedCustomAssets: activeLayoutState?.placedCustomAssets ?? normalizePlacedCustomAssets(layout.placedCustomAssets).filter(
        (asset) => asset.kind !== "building"
      ),
      blockedWalkCells: activeLayoutState?.blockedWalkCells ?? normalizeBlockedWalkCells(layout),
      mapSurrounding: activeLayoutState?.mapSurrounding ?? layout.mapSurrounding ?? "megalithic",
      ground: activeLayoutState?.ground ?? migrateGround(layout),
      cityName: layout.cityName ?? "Agent City",
      managementLanguage: layout.managementLanguage ?? "zh-CN",
      cityLordName: layout.cityLordName ?? "",
      showBuildingStatusIndicators: layout.showBuildingStatusIndicators ?? true,
      showBuildingLabels: layout.showBuildingLabels ?? true,
      themeMode: layout.themeMode ?? "system",
      timeOfDay: layout.timeOfDay ?? "auto",
      allowNpcOffRoad: layout.allowNpcOffRoad ?? false,
      ignoreBuildingCollisionForNpc: layout.ignoreBuildingCollisionForNpc ?? false,
      installedThemePacks,
      activeThemePackId: layout.activeThemePackId ?? null,
      glanceDashboardUrl: layout.glanceDashboardUrl ?? "",
      deviceIntegrations: layout.deviceIntegrations ?? [],
      layoutSchemes,
      activeLayoutSchemeId,
      buildMode: isEssentiallyEmpty,
      buildPreviewMode: false,
      configuredSecretKeys: secrets.filter((secret) => secret.configured).map((secret) => secret.key),
    });
    const currentConfigs = get().characterConfigs;
    Object.entries(currentConfigs).forEach(([characterId, config]) => {
      if (!agentConfigs[characterId] || reconciledConfigs.changedCharacterIds.includes(characterId)) {
        persistAgentConfig(characterId, config);
      }
    });
    await Promise.allSettled((layout.installedSkills ?? []).map((skill) => {
      const content = skill.content ?? skill.contentPreview ?? "";
      if (!content.trim()) return Promise.resolve();
      return saveCitySkillToLibrary({
        id: skill.id,
        slug: skill.slug ?? skill.id,
        name: skill.name,
        icon: skill.icon,
        summary: skill.summary,
        sourceUrl: skill.sourceUrl ?? skill.resolvedUrl ?? "",
        contentPreview: skill.contentPreview ?? content.slice(0, 4_000),
        content,
        resolvedUrl: skill.resolvedUrl,
        commitSha: skill.commitSha,
        contentHash: skill.contentHash,
        requestedCapabilities: skill.requestedCapabilities,
      });
    }));
  },

  refreshSecretStatus: async () => {
    const secrets = await listSecrets();
    set({ configuredSecretKeys: secrets.filter((secret) => secret.configured).map((secret) => secret.key) });
  },

  openLayoutSchemeModal: () => set({ layoutSchemeModalOpen: true }),
  closeLayoutSchemeModal: () => set({ layoutSchemeModalOpen: false }),

  enterCurrentLayoutBuildMode: () =>
    set({
      layoutEditBaseline: createLayoutSnapshot(get()),
      layoutEditDirty: false,
      layoutSchemeModalOpen: false,
      buildMode: true,
      buildPreviewMode: false,
      editingLayoutSchemeId: null,
      selectedId: null,
      activeTerrain: null,
      activeDecoration: null,
      activeCustomAssetId: null,
    }),

  editLayoutScheme: (schemeId) => {
    const scheme = get().layoutSchemes.find((item) => item.id === schemeId);
    if (!scheme) return;
    const layoutEditBaseline = createLayoutSnapshot(get());
    set({
      ...snapshotToLayoutState(scheme.snapshot, get().customCharacters),
      activeLayoutSchemeId: scheme.id,
      editingLayoutSchemeId: scheme.id,
      layoutEditBaseline,
      layoutEditDirty: false,
      layoutSchemeModalOpen: false,
      buildMode: true,
      buildPreviewMode: false,
      selectedId: null,
      activeTerrain: null,
      activeDecoration: null,
      activeCustomAssetId: null,
    });
    void get().save();
  },

  startBlankLayoutScheme: (slot) => {
    const id = `scheme-${slot}`;
    const layoutEditBaseline = createLayoutSnapshot(get());
    const snapshot = emptyLayoutSnapshot();
    set({
      buildings: [],
      decorations: snapshot.decorations ?? [],
      npcs: {},
      buildingResidents: {},
      buildingBookmarks: {},
      buildingTasks: {},
      placedCustomAssets: [],
      blockedWalkCells: {},
      mapSurrounding: snapshot.mapSurrounding ?? "megalithic",
      ground: {},
      activeLayoutSchemeId: null,
      editingLayoutSchemeId: id,
      layoutEditBaseline,
      layoutEditDirty: true,
      layoutSchemeModalOpen: false,
      buildMode: true,
      buildPreviewMode: false,
      selectedId: null,
      activeTerrain: null,
      activeDecoration: null,
      activeCustomAssetId: null,
    });
    void get().save();
  },

  saveCurrentLayoutToScheme: async (slot) => {
    const id = `scheme-${slot}`;
    const now = new Date().toISOString();
    const snapshot = createLayoutSnapshot(get());
    const previewDataUrl = await generateLayoutPreview(snapshot);
    set((s) => ({
      layoutSchemes: normalizeLayoutSchemes([
        ...s.layoutSchemes.filter((scheme) => scheme.slot !== slot),
        {
          id,
          slot,
          name: `方案 ${slot}`,
          updatedAt: now,
          previewDataUrl,
          snapshot,
        },
      ]),
    }));
    await get().save();
  },

  saveEditingLayoutScheme: async () => {
    set({ saveStatus: "saving" });
    const editingId = get().editingLayoutSchemeId;
    const snapshot = createLayoutSnapshot(get());
    if (!editingId) {
      await get().save();
      if (get().saveStatus === "saved") set({ layoutEditBaseline: snapshot, layoutEditDirty: false });
      return;
    }
    try {
      const existing = get().layoutSchemes.find((scheme) => scheme.id === editingId);
      const fallbackSlot = Number(editingId.replace("scheme-", "")) as 1 | 2 | 3;
      const slot = existing?.slot ?? ((LAYOUT_SCHEME_SLOTS as readonly number[]).includes(fallbackSlot) ? fallbackSlot : 1);
      const id = `scheme-${slot}`;
      const now = new Date().toISOString();
      const previewDataUrl = await generateLayoutPreview(snapshot);
      set((s) => ({
        activeLayoutSchemeId: id,
        layoutSchemes: normalizeLayoutSchemes([
          ...s.layoutSchemes.filter((scheme) => scheme.slot !== slot),
          {
            id,
            slot,
            name: `方案 ${slot}`,
            updatedAt: now,
            previewDataUrl,
            snapshot,
          },
        ]),
      }));
      await get().save();
      if (get().saveStatus === "saved") set({ layoutEditBaseline: snapshot, layoutEditDirty: false });
    } catch (error) {
      set({ saveStatus: "error" });
      throw error;
    }
  },

  activateLayoutScheme: (schemeId) => {
    const scheme = get().layoutSchemes.find((item) => item.id === schemeId);
    if (!scheme) return;
    get().editLayoutScheme(schemeId);
    set({ buildMode: false, buildPreviewMode: false, editingLayoutSchemeId: null, layoutEditBaseline: null, layoutEditDirty: false, activeLayoutSchemeId: scheme.id });
    void get().save();
  },

  discardLayoutEdits: () => {
    const { activeLayoutSchemeId, layoutSchemes, customCharacters, layoutEditBaseline } = get();
    const activeScheme = activeLayoutSchemeId
      ? layoutSchemes.find((scheme) => scheme.id === activeLayoutSchemeId)
      : null;
    set({
      ...(layoutEditBaseline
        ? snapshotToLayoutState(layoutEditBaseline, customCharacters)
        : activeScheme
        ? snapshotToLayoutState(activeScheme.snapshot, customCharacters)
        : {}),
      buildMode: false,
      buildPreviewMode: false,
      editingLayoutSchemeId: null,
      layoutEditBaseline: null,
      layoutEditDirty: false,
      layoutSchemeModalOpen: false,
      selectedId: null,
      activeTerrain: null,
      activeDecoration: null,
      activeCustomAssetId: null,
      characterLibraryBuildingId: null,
      characterConfigCharacterId: null,
      characterChatCharacterId: null,
      bookmarkManagerBuildingId: null,
      settingsOpen: false,
      cityHallOpen: false,
      serverDashboardOpen: false,
      themeHallOpen: false,
      todoHallOpen: false,
    });
    void get().save();
  },

  clearCurrentLayoutDraft: () =>
    set({
      buildings: [],
      decorations: [],
      npcs: {},
      buildingResidents: {},
      buildingBookmarks: {},
      buildingTasks: {},
      placedCustomAssets: [],
      ground: {},
      blockedWalkCells: {},
      selectedId: null,
      activeTerrain: null,
      activeDecoration: null,
      activeCustomAssetId: null,
      characterLibraryBuildingId: null,
      bookmarkManagerBuildingId: null,
      layoutEditDirty: true,
    }),

  toggleBuildMode: () =>
    set((s) => ({
      buildMode: !s.buildMode,
      buildPreviewMode: false,
      editingLayoutSchemeId: s.buildMode ? null : s.editingLayoutSchemeId,
      layoutEditBaseline: s.buildMode ? null : createLayoutSnapshot(s),
      layoutEditDirty: false,
      layoutSchemeModalOpen: false,
      selectedId: null,
      activeTerrain: null,
      activeDecoration: null,
      activeCustomAssetId: null,
      characterLibraryBuildingId: null,
      characterConfigCharacterId: null,
      characterChatCharacterId: null,
      bookmarkManagerBuildingId: null,
      settingsOpen: false,
      cityHallOpen: false,
      serverDashboardOpen: false,
      themeHallOpen: false,
      todoHallOpen: false,
    })),

  toggleBuildPreviewMode: () =>
    set((s) => ({
      buildPreviewMode: s.buildMode ? !s.buildPreviewMode : false,
      selectedId: null,
      activeTerrain: null,
      activeDecoration: null,
      activeCustomAssetId: null,
    })),

  selectBuilding: (id) =>
    set({
      selectedId: id,
      activeTerrain: null,
      activeDecoration: null,
      activeCustomAssetId: null,
      characterLibraryBuildingId: null,
      characterConfigCharacterId: null,
      characterChatCharacterId: null,
      bookmarkManagerBuildingId: null,
      settingsOpen: false,
      cityHallOpen: false,
      serverDashboardOpen: false,
      themeHallOpen: false,
      todoHallOpen: false,
    }),

  placeBuilding: (type, x, y) => {
    const bt = buildingTypes[type];
    if (!bt) return;
    const { grid, buildings, decorations, placedCustomAssets, mapSurrounding } = get();
    if (SYSTEM_SINGLETON_BUILDING_TYPES.has(type) && buildings.some((building) => building.type === type)) return;
    if (!canPlace(x, y, bt.size, grid, buildings, buildingTypes)) return;
    if (!footprintCenterInBuildableArea(x, y, bt.size, grid, mapSurrounding)) return;
    if (decorations.some((d) => decorationOverlapsBuildingArea(d, x, y, bt.size))) {
      return;
    }
    if (placedCustomAssets.some((asset) => asset.kind === "decoration" && placedAssetOverlapsBuildingArea(asset, x, y, bt.size))) {
      return;
    }
    const id = `${type}-${Date.now()}`;
    const nextBuildings = [
      ...buildings,
      { id, type, purpose: inferBuildingPurpose(type), x, y, name: bt.name },
    ];
    const nextResidents = { ...get().buildingResidents };
    const defaultCharacter = getDefaultCharacterForBuildingType(type);
    if (
      defaultCharacter &&
      !Object.values(nextResidents).includes(defaultCharacter.id)
    ) {
      nextResidents[id] = defaultCharacter.id;
    }
    set({
      buildings: nextBuildings,
      buildingResidents: nextResidents,
      selectedId: id,
      layoutEditDirty: true,
    });
  },

  moveBuilding: (id, x, y) => {
    const { grid, buildings, decorations, placedCustomAssets, mapSurrounding } = get();
    const b = buildings.find((b) => b.id === id);
    if (!b) return false;
    const size = getPlacedBuildingSize(b, buildingTypes);
    if (!canPlace(x, y, size, grid, buildings, buildingTypes, id)) return false;
    if (!footprintCenterInBuildableArea(x, y, size, grid, mapSurrounding)) return false;
    if (decorations.some((d) => decorationOverlapsBuildingArea(d, x, y, size))) {
      return false;
    }
    if (placedCustomAssets.some((asset) => asset.kind === "decoration" && placedAssetOverlapsBuildingArea(asset, x, y, size))) {
      return false;
    }
    set({
      buildings: buildings.map((b) => (b.id === id ? { ...b, x, y } : b)),
      layoutEditDirty: true,
    });
    return true;
  },

  removeBuilding: (id) => {
    const building = get().buildings.find((b) => b.id === id);
    if (!building) return;
    set((s) => ({
      buildings: s.buildings.filter((b) => b.id !== id),
      npcs: Object.fromEntries(Object.entries(s.npcs).filter(([buildingId]) => buildingId !== id)),
      buildingResidents: Object.fromEntries(
        Object.entries(s.buildingResidents).filter(([buildingId]) => buildingId !== id)
      ),
      buildingBookmarks: Object.fromEntries(
        Object.entries(s.buildingBookmarks).filter(([buildingId]) => buildingId !== id)
      ),
      buildingTasks: Object.fromEntries(
        Object.entries(s.buildingTasks).filter(([buildingId]) => buildingId !== id)
      ),
      selectedId: s.selectedId === id ? null : s.selectedId,
      characterLibraryBuildingId:
        s.characterLibraryBuildingId === id ? null : s.characterLibraryBuildingId,
      layoutEditDirty: true,
    }));
  },

  updateBuilding: (id, patch) =>
    set((s) => {
      const current = s.buildings.find((b) => b.id === id);
      if (!current) return s;
      const nextPurpose = patch.purpose ?? getBuildingPurpose(current);
      if (
        isSystemPurpose(nextPurpose) &&
        getBuildingPurpose(current) !== nextPurpose &&
        s.buildings.some((b) => b.id !== id && getBuildingPurpose(b) === nextPurpose)
      ) {
        return s;
      }
      const candidate = { ...current, ...patch };
      const nextSize = getPlacedBuildingSize(candidate, buildingTypes);
      if (!canPlace(candidate.x, candidate.y, nextSize, s.grid, s.buildings, buildingTypes, id)) {
        return s;
      }
      if (s.decorations.some((d) => decorationOverlapsBuildingArea(d, candidate.x, candidate.y, nextSize))) {
        return s;
      }
      if (s.placedCustomAssets.some((asset) => asset.kind === "decoration" && placedAssetOverlapsBuildingArea(asset, candidate.x, candidate.y, nextSize))) {
        return s;
      }
      return {
        buildings: s.buildings.map((b) => (b.id === id ? candidate : b)),
        layoutEditDirty: true,
      };
    }),

  resizeBuilding: (id, size) => {
    const width = Math.max(1, Math.floor(size[0]));
    const height = Math.max(1, Math.floor(size[1]));
    const { grid, buildings, decorations, placedCustomAssets, mapSurrounding } = get();
    const building = buildings.find((item) => item.id === id);
    if (!building) return false;
    const nextSize: [number, number] = [width, height];
    if (!canPlace(building.x, building.y, nextSize, grid, buildings, buildingTypes, id)) return false;
    if (!footprintCenterInBuildableArea(building.x, building.y, nextSize, grid, mapSurrounding)) return false;
    if (decorations.some((decoration) => decorationOverlapsBuildingArea(decoration, building.x, building.y, nextSize))) {
      return false;
    }
    if (
      placedCustomAssets.some(
        (asset) => asset.kind === "decoration" && placedAssetOverlapsBuildingArea(asset, building.x, building.y, nextSize)
      )
    ) {
      return false;
    }
    set({
      buildings: buildings.map((item) => (item.id === id ? { ...item, size: nextSize } : item)),
      layoutEditDirty: true,
    });
    return true;
  },

  canPlaceAt: (type, x, y, ignoreId) => {
    const bt = buildingTypes[type];
    if (!bt) return false;
    const { grid, buildings, decorations, placedCustomAssets, mapSurrounding } = get();
    const movingBuilding = ignoreId ? buildings.find((b) => b.id === ignoreId) : null;
    const size = movingBuilding ? getPlacedBuildingSize(movingBuilding, buildingTypes) : bt.size;
    return (
      canPlace(x, y, size, grid, buildings, buildingTypes, ignoreId) &&
      footprintCenterInBuildableArea(x, y, size, grid, mapSurrounding) &&
      !decorations.some((d) => decorationOverlapsBuildingArea(d, x, y, size)) &&
      !placedCustomAssets.some((asset) => asset.kind === "decoration" && placedAssetOverlapsBuildingArea(asset, x, y, size))
    );
  },

  setActiveTerrain: (terrain) =>
    set({ activeTerrain: terrain, activeDecoration: null, activeCustomAssetId: null, selectedId: null }),

  paintGround: (x, y) => {
    const { grid, activeTerrain, ground } = get();
    if (!activeTerrain) return;
    const maxX = grid.cols * TERRAIN_SUBDIV;
    const maxY = grid.rows * TERRAIN_SUBDIV;
    if (x < 0 || y < 0 || x >= maxX || y >= maxY) return;
    const key = groundKey(x, y);
    if (activeTerrain === "grass") {
      // grass is the default, so store it sparsely: just delete the override
      if (!(key in ground)) return;
      const next = { ...ground };
      delete next[key];
      set({ ground: next, layoutEditDirty: true });
      return;
    }
    if (ground[key] === activeTerrain) return;
    set({ ground: { ...ground, [key]: activeTerrain }, layoutEditDirty: true });
  },

  setActiveDecoration: (decoration) =>
    set({ activeDecoration: decoration, activeTerrain: null, activeCustomAssetId: null, selectedId: null }),

  placeDecoration: (type, x, y) => {
    const { grid, buildings, decorations } = get();
    const maxX = grid.cols * TERRAIN_SUBDIV;
    const maxY = grid.rows * TERRAIN_SUBDIV;
    if (x < 0 || y < 0 || x >= maxX || y >= maxY) return;
    const overlapsBuilding = buildings.some((b) =>
      decorationOverlapsBuilding(x, y, b, buildingTypes)
    );
    if (overlapsBuilding) return;

    const existing = decorations.find((d) => d.x === x && d.y === y);
    if (existing?.type === type) {
      set({ decorations: decorations.filter((d) => d.id !== existing.id), layoutEditDirty: true });
      return;
    }
    if (existing) {
      set({
        decorations: decorations.map((d) => (d.id === existing.id ? { ...d, type } : d)),
        layoutEditDirty: true,
      });
      return;
    }
    set({
      decorations: [...decorations, { id: `${type}-${Date.now()}`, type, x, y }],
      layoutEditDirty: true,
    });
  },

  removeDecoration: (id) =>
    set((s) => ({ decorations: s.decorations.filter((d) => d.id !== id), layoutEditDirty: true })),

  upsertCustomAssets: (assets) =>
    set((s) => {
      const next = new Map(s.customAssets.map((asset) => [asset.id, asset]));
      assets.forEach((asset) => next.set(asset.id, localizeProjectAsset(asset)));
      return { customAssets: Array.from(next.values()) };
    }),

  selectCustomAsset: (assetId) =>
    set({
      activeCustomAssetId: assetId,
      activeTerrain: null,
      activeDecoration: null,
      selectedId: null,
    }),

  placeCustomAsset: (assetId, x, y) => {
    const asset = get().customAssets.find((item) => item.id === assetId);
    if (!asset) return;
    if (asset.kind === "building") {
      const spec = getThemeBuildingSpec(asset.url);
      const type = spec?.type ?? "custom-link";
      const size = spec?.size ?? getCustomBuildingSize(asset.url);
      const { grid, buildings, decorations, placedCustomAssets, mapSurrounding } = get();
      if (SYSTEM_SINGLETON_BUILDING_TYPES.has(type) && buildings.some((building) => building.type === type)) return;
      if (!canPlace(x, y, size, grid, buildings, buildingTypes)) return;
      if (!footprintCenterInBuildableArea(x, y, size, grid, mapSurrounding)) return;
      if (decorations.some((d) => decorationOverlapsBuildingArea(d, x, y, size))) {
        return;
      }
      if (placedCustomAssets.some((placed) => placed.kind === "decoration" && placedAssetOverlapsBuildingArea(placed, x, y, size))) {
        return;
      }
      const id = `custom-building-${Date.now()}`;
      const nextResidents = { ...get().buildingResidents };
      const defaultCharacter = getDefaultCharacterForBuildingType(type);
      if (
        defaultCharacter &&
        !Object.values(nextResidents).includes(defaultCharacter.id)
      ) {
        nextResidents[id] = defaultCharacter.id;
      }
      set({
        buildings: [
          ...buildings,
          {
            id,
            type,
            purpose: inferBuildingPurpose(type),
            x,
            y,
            name: asset.name,
            customAssetId: asset.id,
            customImageUrl: asset.url,
            size,
          },
        ],
        buildingResidents: nextResidents,
        selectedId: id,
        layoutEditDirty: true,
      });
      return;
    }
    const { grid, buildings, mapSurrounding } = get();
    const maxX = grid.cols * TERRAIN_SUBDIV;
    const maxY = grid.rows * TERRAIN_SUBDIV;
    const size = asset.kind === "terrain"
      ? { width: TERRAIN_SUBDIV * 2, height: TERRAIN_SUBDIV * 2 }
      : { width: 4, height: 4 };
    const rawX = asset.kind === "terrain" ? snapTerrainCoordinate(x) : x;
    const rawY = asset.kind === "terrain" ? snapTerrainCoordinate(y) : y;
    const safeX = Math.max(0, Math.min(rawX, maxX - size.width));
    const safeY = Math.max(0, Math.min(rawY, maxY - size.height));
    if (!terrainFootprintCenterInBuildableArea(safeX, safeY, size, grid, mapSurrounding)) return;
    if (asset.kind === "decoration") {
      const blockedByBuilding = buildings.some((building) =>
        placedAssetOverlapsBuildingArea(
          { id: "preview", assetId: asset.id, kind: asset.kind, name: asset.name, url: asset.url, x: safeX, y: safeY, ...size },
          building.x,
          building.y,
          getPlacedBuildingSize(building, buildingTypes)
        )
      );
      if (blockedByBuilding) return;
    }
    set((s) => {
      const existingAtCell = s.placedCustomAssets.find(
        (placed) => placed.kind === asset.kind && placed.x === safeX && placed.y === safeY
      );
      if (existingAtCell?.assetId === asset.id) {
        return s;
      }
      const withoutReplacedTerrain = asset.kind === "terrain"
        ? s.placedCustomAssets.filter(
            (placed) => !(placed.kind === "terrain" && placed.x === safeX && placed.y === safeY)
          )
        : s.placedCustomAssets;
      return {
        placedCustomAssets: [
          ...withoutReplacedTerrain,
          {
          id: `placed-${asset.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          assetId: asset.id,
          kind: asset.kind,
          name: asset.name,
          url: asset.url,
          x: safeX,
          y: safeY,
          ...size,
          },
        ],
        layoutEditDirty: true,
      };
    });
  },

  placeCustomAssetInstance: (assetId, x, y, options) => {
    const asset = get().customAssets.find((item) => item.id === assetId);
    if (!asset || (asset.kind !== "terrain" && asset.kind !== "decoration")) return false;
    const { grid, buildings, placedCustomAssets, mapSurrounding } = get();
    const minimumSize = asset.kind === "terrain" ? 2 : 1;
    const maxX = grid.cols * TERRAIN_SUBDIV;
    const maxY = grid.rows * TERRAIN_SUBDIV;
    const size = {
      width: Math.max(minimumSize, Math.floor(options.width || minimumSize)),
      height: Math.max(minimumSize, Math.floor(options.height || minimumSize)),
    };
    const rawX = asset.kind === "terrain" ? snapTerrainCoordinate(x) : Math.floor(x);
    const rawY = asset.kind === "terrain" ? snapTerrainCoordinate(y) : Math.floor(y);
    const safeX = Math.max(0, Math.min(rawX, maxX - size.width));
    const safeY = Math.max(0, Math.min(rawY, maxY - size.height));
    if (!terrainFootprintCenterInBuildableArea(safeX, safeY, size, grid, mapSurrounding)) return false;
    const candidate: PlacedCustomAsset = {
      id: `placed-${asset.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      assetId: asset.id,
      kind: asset.kind,
      name: asset.name,
      url: asset.url,
      x: safeX,
      y: safeY,
      ...size,
    };
    if (asset.kind === "decoration") {
      const blockedByBuilding = buildings.some((building) =>
        placedAssetOverlapsBuildingArea(candidate, building.x, building.y, getPlacedBuildingSize(building, buildingTypes))
      );
      if (blockedByBuilding) return false;
      if (placedCustomAssets.some((placed) => placed.kind === "decoration" && placedAssetsOverlap(candidate, placed))) return false;
    }
    set((s) => {
      const withoutReplacedTerrain = asset.kind === "terrain"
        ? s.placedCustomAssets.filter(
            (placed) => !(placed.kind === "terrain" && placed.x === safeX && placed.y === safeY)
          )
        : s.placedCustomAssets;
      return {
        placedCustomAssets: [...withoutReplacedTerrain, candidate],
        layoutEditDirty: true,
      };
    });
    return true;
  },

  removeCustomAsset: (id) =>
    set((s) => ({ placedCustomAssets: s.placedCustomAssets.filter((asset) => asset.id !== id), layoutEditDirty: true })),

  moveCustomAsset: (id, x, y) =>
    set((s) => {
      const asset = s.placedCustomAssets.find((item) => item.id === id);
      if (!asset) return s;
      const maxX = s.grid.cols * TERRAIN_SUBDIV;
      const maxY = s.grid.rows * TERRAIN_SUBDIV;
      const rawX = asset.kind === "terrain" ? snapTerrainCoordinate(x) : x;
      const rawY = asset.kind === "terrain" ? snapTerrainCoordinate(y) : y;
      const safeX = Math.max(0, Math.min(rawX, maxX - asset.width));
      const safeY = Math.max(0, Math.min(rawY, maxY - asset.height));
      if (
        !terrainFootprintCenterInBuildableArea(
          safeX,
          safeY,
          { width: asset.width, height: asset.height },
          s.grid,
          s.mapSurrounding
        )
      ) {
        return s;
      }
      if (asset.kind === "decoration") {
        const blockedByBuilding = s.buildings.some((building) =>
          placedAssetOverlapsBuildingArea(
            { ...asset, x: safeX, y: safeY },
            building.x,
            building.y,
            getPlacedBuildingSize(building, buildingTypes)
          )
        );
        if (blockedByBuilding) return s;
      }
      return {
        placedCustomAssets: s.placedCustomAssets.map((item) =>
          item.id === id ? { ...item, x: safeX, y: safeY } : item
        ),
        layoutEditDirty: true,
      };
    }),

  resizeCustomAsset: (id, width, height) => {
    const { grid, buildings, placedCustomAssets, mapSurrounding } = get();
    const asset = placedCustomAssets.find((item) => item.id === id);
    if (!asset || (asset.kind !== "decoration" && asset.kind !== "terrain")) return false;
    const minimumSize = asset.kind === "terrain" ? 2 : 1;
    const nextWidth = Math.max(minimumSize, Math.floor(width));
    const nextHeight = Math.max(minimumSize, Math.floor(height));
    const maxX = grid.cols * TERRAIN_SUBDIV;
    const maxY = grid.rows * TERRAIN_SUBDIV;
    if (asset.x < 0 || asset.y < 0 || asset.x + nextWidth > maxX || asset.y + nextHeight > maxY) return false;
    const candidate = { ...asset, width: nextWidth, height: nextHeight };
    if (!terrainFootprintCenterInBuildableArea(asset.x, asset.y, { width: nextWidth, height: nextHeight }, grid, mapSurrounding)) {
      return false;
    }
    const blockedByBuilding = asset.kind === "decoration" && buildings.some((building) =>
      placedAssetOverlapsBuildingArea(
        candidate,
        building.x,
        building.y,
        getPlacedBuildingSize(building, buildingTypes)
      )
    );
    if (blockedByBuilding) return false;
    const blockedByAsset = asset.kind === "decoration" && placedCustomAssets.some(
      (item) => item.id !== id && item.kind === "decoration" && placedAssetsOverlap(candidate, item)
    );
    if (blockedByAsset) return false;
    set({
      placedCustomAssets: placedCustomAssets.map((item) =>
        item.id === id ? candidate : item
      ),
      layoutEditDirty: true,
    });
    return true;
  },

  eraseTerrainAt: (x, y) => {
    const { grid } = get();
    const maxX = grid.cols * TERRAIN_SUBDIV;
    const maxY = grid.rows * TERRAIN_SUBDIV;
    if (x < 0 || y < 0 || x >= maxX || y >= maxY) return;
    set((s) => {
      const nextGround = { ...s.ground };
      const terrainKeys = new Set<string>();
      for (let dx = 0; dx < TERRAIN_SUBDIV * 2; dx += 1) {
        for (let dy = 0; dy < TERRAIN_SUBDIV * 2; dy += 1) {
          terrainKeys.add(groundKey(snapTerrainCoordinate(x) + dx, snapTerrainCoordinate(y) + dy));
          terrainKeys.add(groundKey(x + dx, y + dy));
        }
      }
      terrainKeys.forEach((key) => {
        delete nextGround[key];
      });
      const target = { x, y };
      const placedCustomAssets = s.placedCustomAssets.filter(
        (asset) => !(asset.kind === "terrain" && placedAssetCoversPoint(asset, target))
      );
      return { ground: nextGround, placedCustomAssets, layoutEditDirty: true };
    });
  },

  clearAllTerrainTiles: () =>
    set((s) => ({
      ground: {},
      placedCustomAssets: s.placedCustomAssets.filter((asset) => asset.kind !== "terrain"),
      activeTerrain: null,
      activeCustomAssetId: null,
      layoutEditDirty: true,
    })),

  toggleBlockedWalkCell: (x, y, mode) => {
    const { grid } = get();
    if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) return;
    const key = groundKey(x, y);
    set((s) => {
      const next = { ...s.blockedWalkCells };
      if (mode === "block") next[key] = true;
      else delete next[key];
      return { blockedWalkCells: next, layoutEditDirty: true };
    });
  },

  clearBlockedWalkCells: () => set({ blockedWalkCells: {}, layoutEditDirty: true }),

  clearScenePaint: () =>
    set({
      ground: {},
      decorations: [],
      placedCustomAssets: [],
      blockedWalkCells: {},
      activeTerrain: null,
      activeDecoration: null,
      activeCustomAssetId: null,
      layoutEditDirty: true,
    }),

  setMapSurrounding: (surrounding) => set((s) =>
    s.mapSurrounding === surrounding ? s : { mapSurrounding: surrounding, layoutEditDirty: true }
  ),

  openCharacterLibrary: (buildingId) =>
    set({
      characterLibraryBuildingId: buildingId,
      activeTerrain: null,
      activeDecoration: null,
    }),

  closeCharacterLibrary: () => set({ characterLibraryBuildingId: null }),

  createCharacter: (input) => {
    const base = getCharacterById(input.templateCharacterId, get().customCharacters) ?? getAllCharacters()[0];
    const slug = slugify(input.name || "agent");
    const id = `custom-${slug}-${Date.now().toString(36)}`;
    const character: NpcDefinition = {
      id,
      defaultBuildingType: input.defaultBuildingType || base.defaultBuildingType,
      name: input.name.trim() || "New Agent",
      role: input.role.trim() || "城市 Agent",
      icon: (input.name.trim() || "A").slice(0, 1).toUpperCase(),
      spriteUrl: base.spriteUrl,
      walkSprite: base.walkSprite,
      accent: base.accent,
      homeLine: input.personality.trim() || "我正在 Agent City 里适应新的职责。",
      walkingLine: "我在熟悉街区，检查哪里需要关注。",
      custom: true,
    };
    const config = createDefaultCharacterConfig(character);
    config.files.identity = input.personality.trim()
      ? input.personality.trim()
      : config.files.identity;
    set((s) => ({
      customCharacters: [character, ...s.customCharacters.filter((item) => item.id !== id)],
      characterConfigs: {
        ...s.characterConfigs,
        [id]: config,
      },
    }));
    persistAgentConfig(id, config);
    void get().save();
    return id;
  },

  openCharacterConfig: (characterId) =>
    set({
      characterConfigCharacterId: characterId,
      activeTerrain: null,
      activeDecoration: null,
    }),

  closeCharacterConfig: () => set({ characterConfigCharacterId: null }),

  updateCharacterBrain: (characterId, patch) => {
    set((s) => {
      const character = getCharacterById(characterId, s.customCharacters);
      if (!character) return s;
      const current = s.characterConfigs[characterId] ?? createDefaultCharacterConfig(character);
      return {
        characterConfigs: {
          ...s.characterConfigs,
          [characterId]: {
            ...current,
            brain: { ...current.brain, ...patch },
          },
        },
      };
    });
    const config = get().characterConfigs[characterId];
    if (config) persistAgentConfig(characterId, config);
  },

  updateCharacterPermissions: (characterId, patch) => {
    set((s) => {
      const character = getCharacterById(characterId, s.customCharacters);
      if (!character) return s;
      const current = s.characterConfigs[characterId] ?? createDefaultCharacterConfig(character);
      const { workspaceRoot, ...permissionPatch } = patch;
      return {
        characterConfigs: {
          ...s.characterConfigs,
          [characterId]: {
            ...current,
            permissions: { ...current.permissions, ...permissionPatch } as AgentPermissions,
            workspaceRoot: workspaceRoot !== undefined ? workspaceRoot : current.workspaceRoot,
          },
        },
      };
    });
    const config = get().characterConfigs[characterId];
    if (config) persistAgentConfig(characterId, config);
  },

  updateCharacterDisplayName: (characterId, displayName) => {
    set((s) => {
      const character = getCharacterById(characterId, s.customCharacters);
      if (!character) return s;
      const current = s.characterConfigs[characterId] ?? createDefaultCharacterConfig(character);
      return {
        characterConfigs: {
          ...s.characterConfigs,
          [characterId]: {
            ...current,
            displayName: displayName.trim() || character.name,
          },
        },
      };
    });
    const config = get().characterConfigs[characterId];
    if (config) persistAgentConfig(characterId, config);
  },

  updateCharacterCoreFile: (characterId, file, value) => {
    set((s) => {
      const character = getCharacterById(characterId, s.customCharacters);
      if (!character) return s;
      const current = s.characterConfigs[characterId] ?? createDefaultCharacterConfig(character);
      return {
        characterConfigs: {
          ...s.characterConfigs,
          [characterId]: {
            ...current,
            files: { ...current.files, [file]: value },
          },
        },
      };
    });
    const config = get().characterConfigs[characterId];
    if (config) persistAgentConfig(characterId, config);
  },

  updateCharacterSkillEnabled: (characterId, skillId, enabled) => {
    set((s) => {
      const character = getCharacterById(characterId, s.customCharacters);
      if (!character) return s;
      const current = s.characterConfigs[characterId] ?? createDefaultCharacterConfig(character);
      return {
        characterConfigs: {
          ...s.characterConfigs,
          [characterId]: {
            ...current,
            skillEnabledById: { ...(current.skillEnabledById ?? {}), [skillId]: enabled },
          },
        },
      };
    });
    const config = get().characterConfigs[characterId];
    if (config) persistAgentConfig(characterId, config);
  },

  updateCharacterSchedule: (characterId, patch) => {
    set((s) => {
      const character = getCharacterById(characterId, s.customCharacters);
      if (!character) return s;
      const current = s.characterConfigs[characterId] ?? createDefaultCharacterConfig(character);
      const defaults = createDefaultCharacterConfig(character).schedule;
      const schedule = {
        enabled: patch.enabled ?? current.schedule?.enabled ?? defaults?.enabled ?? false,
        clock: patch.clock ?? current.schedule?.clock ?? defaults?.clock ?? "server",
        timezone: patch.timezone ?? current.schedule?.timezone ?? defaults?.timezone ?? "Asia/Shanghai",
        workdays: patch.workdays ?? current.schedule?.workdays ?? defaults?.workdays ?? [1, 2, 3, 4, 5],
        startTime: patch.startTime ?? current.schedule?.startTime ?? defaults?.startTime ?? "09:00",
        endTime: patch.endTime ?? current.schedule?.endTime ?? defaults?.endTime ?? "18:00",
        location: patch.location ?? current.schedule?.location ?? defaults?.location ?? character.defaultBuildingType,
      };
      return {
        characterConfigs: {
          ...s.characterConfigs,
          [characterId]: {
            ...current,
            schedule,
          },
        },
      };
    });
    const config = get().characterConfigs[characterId];
    if (config) persistAgentConfig(characterId, config);
  },

  addCharacterTimedTask: (characterId, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    set((s) => {
      const character = getCharacterById(characterId, s.customCharacters);
      if (!character) return s;
      const current = s.characterConfigs[characterId] ?? createDefaultCharacterConfig(character);
      const task: AgentTimedTask = {
        id: `timed-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: trimmed,
        time: "09:00",
        days: [1, 2, 3, 4, 5],
        location: current.schedule?.location ?? character.defaultBuildingType,
        enabled: true,
      };
      return {
        characterConfigs: {
          ...s.characterConfigs,
          [characterId]: {
            ...current,
            timedTasks: [task, ...(current.timedTasks ?? [])],
          },
        },
      };
    });
    const config = get().characterConfigs[characterId];
    if (config) persistAgentConfig(characterId, config);
  },

  updateCharacterTimedTask: (characterId, taskId, patch) => {
    set((s) => {
      const character = getCharacterById(characterId, s.customCharacters);
      if (!character) return s;
      const current = s.characterConfigs[characterId] ?? createDefaultCharacterConfig(character);
      return {
        characterConfigs: {
          ...s.characterConfigs,
          [characterId]: {
            ...current,
            timedTasks: (current.timedTasks ?? []).map((task) =>
              task.id === taskId ? { ...task, ...patch, title: patch.title?.trim() ?? task.title } : task
            ),
          },
        },
      };
    });
    const config = get().characterConfigs[characterId];
    if (config) persistAgentConfig(characterId, config);
  },

  removeCharacterTimedTask: (characterId, taskId) => {
    set((s) => {
      const character = getCharacterById(characterId, s.customCharacters);
      if (!character) return s;
      const current = s.characterConfigs[characterId] ?? createDefaultCharacterConfig(character);
      return {
        characterConfigs: {
          ...s.characterConfigs,
          [characterId]: {
            ...current,
            timedTasks: (current.timedTasks ?? []).filter((task) => task.id !== taskId),
          },
        },
      };
    });
    const config = get().characterConfigs[characterId];
    if (config) persistAgentConfig(characterId, config);
  },

  resetCharacterConfig: (characterId) => {
    set((s) => {
      const character = getCharacterById(characterId, s.customCharacters);
      if (!character) return s;
      const current = s.characterConfigs[characterId];
      const defaults = createDefaultCharacterConfig(character);
      return {
        characterConfigs: {
          ...s.characterConfigs,
          [characterId]: {
            ...defaults,
            learnedSkillIds: current?.learnedSkillIds ?? [],
            learnedSkills: current?.learnedSkills ?? [],
            skillEnabledById: current?.skillEnabledById ?? {},
            schedule: current?.schedule ?? defaults.schedule,
            timedTasks: current?.timedTasks ?? [],
            configFilePath: current?.configFilePath,
          },
        },
      };
    });
    const config = get().characterConfigs[characterId];
    if (config) persistAgentConfig(characterId, config);
  },

  openCharacterChat: (characterId) =>
    set((s) => {
      const currentSessions = s.characterChatSessions[characterId] ?? [];
      if (currentSessions.length) {
        return {
          characterChatCharacterId: characterId,
          activeTerrain: null,
          activeDecoration: null,
          chatStatus: "idle",
          chatError: null,
        };
      }
      const now = new Date().toISOString();
      const session: CharacterChatSession = {
        id: createSessionId(),
        title: "新对话",
        messages: [],
        createdAt: now,
        updatedAt: now,
      };
      return {
        characterChatCharacterId: characterId,
        activeTerrain: null,
        activeDecoration: null,
        chatStatus: "idle",
        chatError: null,
        characterChatSessions: {
          ...s.characterChatSessions,
          [characterId]: [session],
        },
        activeCharacterChatSessionIds: {
          ...s.activeCharacterChatSessionIds,
          [characterId]: session.id,
        },
      };
    }),

  closeCharacterChat: () => set({ characterChatCharacterId: null, chatStatus: "idle", chatError: null }),

  openBookmarkManager: (buildingId) =>
    set({
      bookmarkManagerBuildingId: buildingId,
      selectedId: null,
      activeTerrain: null,
      activeDecoration: null,
      characterLibraryBuildingId: null,
      characterConfigCharacterId: null,
      characterChatCharacterId: null,
      skillHallOpen: false,
      settingsOpen: false,
      cityHallOpen: false,
      serverDashboardOpen: false,
      themeHallOpen: false,
      todoHallOpen: false,
    }),

  closeBookmarkManager: () => set({ bookmarkManagerBuildingId: null }),

  updateBuildingBookmarks: (buildingId, groups) =>
    set((s) => ({
      buildingBookmarks: {
        ...s.buildingBookmarks,
        [buildingId]: groups,
      },
    })),

  addBuildingTask: (buildingId, title, status = "todo") => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const task: BuildingTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: trimmed,
      status,
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({
      buildingTasks: {
        ...s.buildingTasks,
        [buildingId]: [task, ...(s.buildingTasks[buildingId] ?? [])],
      },
    }));
    void get().save();
  },

  updateBuildingTask: (buildingId, taskId, patch) => {
    set((s) => ({
      buildingTasks: {
        ...s.buildingTasks,
        [buildingId]: (s.buildingTasks[buildingId] ?? []).map((task) =>
          task.id === taskId
            ? {
                ...task,
                ...patch,
                title: patch.title !== undefined ? patch.title.trim() : task.title,
                note: patch.note !== undefined ? patch.note.trim() : task.note,
                status: (patch.status ?? task.status) as BuildingTaskStatus,
                updatedAt: new Date().toISOString(),
              }
            : task
        ),
      },
    }));
    void get().save();
  },

  removeBuildingTask: (buildingId, taskId) => {
    set((s) => ({
      buildingTasks: {
        ...s.buildingTasks,
        [buildingId]: (s.buildingTasks[buildingId] ?? []).filter((task) => task.id !== taskId),
      },
    }));
    void get().save();
  },

  createCharacterChatSession: (characterId) =>
    set((s) => {
      const now = new Date().toISOString();
      const session: CharacterChatSession = {
        id: createSessionId(),
        title: "新对话",
        messages: [],
        createdAt: now,
        updatedAt: now,
      };
      return {
        characterChatSessions: {
          ...s.characterChatSessions,
          [characterId]: [session, ...(s.characterChatSessions[characterId] ?? [])],
        },
        activeCharacterChatSessionIds: {
          ...s.activeCharacterChatSessionIds,
          [characterId]: session.id,
        },
        chatStatus: "idle",
        chatError: null,
      };
    }),

  selectCharacterChatSession: (characterId, sessionId) =>
    set((s) => ({
      activeCharacterChatSessionIds: {
        ...s.activeCharacterChatSessionIds,
        [characterId]: sessionId,
      },
      chatStatus: "idle",
      chatError: null,
    })),

  toggleCharacterChatSessionPinned: (characterId, sessionId) => {
    set((s) => ({
      characterChatSessions: {
        ...s.characterChatSessions,
        [characterId]: (s.characterChatSessions[characterId] ?? []).map((session) =>
          session.id === sessionId ? { ...session, pinned: !session.pinned } : session
        ),
      },
    }));
    void get().save();
  },

  deleteCharacterChatSession: async (characterId, sessionId) => {
    const session = get().characterChatSessions[characterId]?.find((item) => item.id === sessionId);
    if (!session) return;
    if (session.serverSessionId) await deleteServerAgentSession(session.serverSessionId);
    set((state) => {
      const remaining = (state.characterChatSessions[characterId] ?? []).filter((item) => item.id !== sessionId);
      const wasActive = state.activeCharacterChatSessionIds[characterId] === sessionId;
      const nextActiveId = wasActive ? remaining[0]?.id : state.activeCharacterChatSessionIds[characterId];
      const nextActiveIds = { ...state.activeCharacterChatSessionIds };
      if (nextActiveId) nextActiveIds[characterId] = nextActiveId;
      else delete nextActiveIds[characterId];
      return {
        characterChatSessions: { ...state.characterChatSessions, [characterId]: remaining },
        activeCharacterChatSessionIds: nextActiveIds,
        chatStatus: "idle",
        chatError: null,
      };
    });
    await get().save();
  },

  markCharacterChatRunCancelled: (runId) => {
    set((s) => ({
      chatStatus: "idle",
      chatError: null,
      characterChatSessions: Object.fromEntries(
        Object.entries(s.characterChatSessions).map(([characterId, sessions]) => [
          characterId,
          sessions.map((session) => ({
            ...session,
            messages: session.messages.map((message) => message.runId === runId ? {
              ...message,
              content: "已停止执行。",
              status: "cancelled" as const,
            } : message),
          })),
        ]),
      ),
    }));
    void get().save();
  },

  syncScheduledChatMessages: async (characterId) => {
    const serverSessions = await listServerAgentSessions(characterId);
    const deliveries = await Promise.all(serverSessions.map(async (session) => ({
      session,
      messages: (await listServerAgentMessages(session.id)).filter((message) => message.role === "assistant" && message.metadata?.scheduledDelivery === true),
    })));
    set((state) => {
      let sessions = [...(state.characterChatSessions[characterId] ?? [])];
      for (const delivery of deliveries) {
        if (!delivery.messages.length) continue;
        let index = sessions.findIndex((session) => session.serverSessionId === delivery.session.id);
        if (index < 0) {
          sessions.push({ id: createSessionId(), serverSessionId: delivery.session.id, title: delivery.session.title || "定时任务", messages: [], createdAt: delivery.session.createdAt, updatedAt: delivery.session.updatedAt });
          index = sessions.length - 1;
        }
        const local = sessions[index];
        const knownRunIds = new Set(local.messages.map((message) => message.runId).filter(Boolean));
        const synced = delivery.messages.map((message): CharacterChatMessage => ({
          id: `server-${message.id}`,
          role: "assistant",
          content: message.content,
          createdAt: message.createdAt,
          runId: message.runId ?? undefined,
          status: message.metadata.status === "completed" ? "succeeded" : message.metadata.status as CharacterChatMessage["status"],
          citations: Array.isArray(message.metadata.citations) ? message.metadata.citations as Array<Record<string, unknown>> : [],
        }));
        const merged = [
          ...local.messages.filter((message) => !message.runId || !synced.some((item) => item.runId === message.runId)),
          ...synced.filter((message) => !knownRunIds.has(message.runId) || local.messages.some((item) => item.runId === message.runId)),
        ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        sessions[index] = { ...local, title: delivery.session.title || local.title, updatedAt: delivery.session.updatedAt, messages: merged };
      }
      return { characterChatSessions: { ...state.characterChatSessions, [characterId]: sessions } };
    });
    void get().save();
  },

  sendCharacterChatMessage: async (characterId, content, attachments = []) => {
    const trimmed = content.trim();
    const character = getCharacterById(characterId, get().customCharacters);
    if ((!trimmed && !attachments.length) || !character) return;
    const messageContent = trimmed || "请查看附件。";

    const config = get().characterConfigs[characterId] ?? createDefaultCharacterConfig(character);
    let sessionId = get().activeCharacterChatSessionIds[characterId];
    if (!sessionId) {
      get().createCharacterChatSession(characterId);
      sessionId = get().activeCharacterChatSessionIds[characterId];
    }
    if (!sessionId) return;

    const userMessage: CharacterChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageContent,
      createdAt: new Date().toISOString(),
      attachments,
    };

    set((s) => ({
      chatStatus: "sending",
      chatError: null,
      characterChatSessions: {
        ...s.characterChatSessions,
        [characterId]: (s.characterChatSessions[characterId] ?? []).map((session) => {
          if (session.id !== sessionId) return session;
          return {
            ...session,
            title: session.messages.length ? session.title : (trimmed || attachments[0]?.name || "附件").slice(0, 28),
            messages: [...session.messages, userMessage],
            updatedAt: userMessage.createdAt,
          };
        }),
      },
    }));

    const activeSession = get().characterChatSessions[characterId]?.find(
      (session) => session.id === sessionId
    );
    const latestMessages = activeSession?.messages ?? [];
    const assignedBuildingId = Object.entries(get().buildingResidents).find(
      ([, assignedCharacterId]) => assignedCharacterId === characterId
    )?.[0];
    const building = assignedBuildingId
      ? get().buildings.find((item) => item.id === assignedBuildingId) ?? null
      : null;
    const taskCommand = building && getBuildingPurpose(building) === "todo-hall"
      ? parseTaskCommand(messageContent)
      : null;

    if (building && taskCommand) {
      let assistantText = "";
      if (taskCommand.action === "add") {
        get().addBuildingTask(building.id, taskCommand.title);
        assistantText = `已经把「${taskCommand.title}」加入待办大厅。`;
      } else if (taskCommand.action === "status") {
        const task = findTaskByTitle(get().buildingTasks[building.id] ?? [], taskCommand.title);
        if (task) {
          get().updateBuildingTask(building.id, task.id, { status: taskCommand.status });
          assistantText = `已把「${task.title}」标记为「${taskStatusLabel(taskCommand.status)}」。`;
        } else {
          assistantText = `我没有在待办大厅里找到「${taskCommand.title}」。你可以先说“添加待办 ${taskCommand.title}”。`;
        }
      } else {
        const task = findTaskByTitle(get().buildingTasks[building.id] ?? [], taskCommand.title);
        if (task) {
          get().removeBuildingTask(building.id, task.id);
          assistantText = `已从待办大厅删除「${task.title}」。`;
        } else {
          assistantText = `我没有在待办大厅里找到「${taskCommand.title}」。`;
        }
      }

      const assistantMessage: CharacterChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: assistantText,
        createdAt: new Date().toISOString(),
      };
      set((s) => ({
        chatStatus: "idle",
        characterChatSessions: {
          ...s.characterChatSessions,
          [characterId]: (s.characterChatSessions[characterId] ?? []).map((session) => {
            if (session.id !== sessionId) return session;
            return {
              ...session,
              messages: [...session.messages, assistantMessage],
              updatedAt: assistantMessage.createdAt,
            };
          }),
        },
      }));
      void get().save();
      return;
    }

    let runtimeAssistantId = `assistant-run-${Date.now()}`;
    try {
      const enabledLearnedSkills = (config.learnedSkills ?? []).filter(
        (skill) => config.skillEnabledById?.[skill.id] ?? true
      );
      const result = await sendCharacterChat({
        character,
        building,
        brain: config.brain,
        files: config.files,
        messages: latestMessages.slice(-24),
        bookmarkGroups: Object.values(get().buildingBookmarks).flat(),
        characterName: config.displayName?.trim() || character.name,
        managementLanguage: get().managementLanguage,
        cityLordName: get().cityLordName,
        cityContext: createCityContextSnapshot(get(), characterId),
        learnedSkills: enabledLearnedSkills,
        schedule: config.schedule,
        timedTasks: config.timedTasks ?? [],
      }, {
        serverSessionId: activeSession?.serverSessionId,
        onStarted: ({ sessionId: serverSessionId, runId }) => {
          const createdAt = new Date().toISOString();
          set((s) => ({
            npcs: assignedBuildingId && s.npcs[assignedBuildingId] ? {
              ...s.npcs,
              [assignedBuildingId]: { ...s.npcs[assignedBuildingId], mood: "busy", runtimeStatus: "running" },
            } : s.npcs,
            characterChatSessions: {
              ...s.characterChatSessions,
              [characterId]: (s.characterChatSessions[characterId] ?? []).map((session) => {
                if (session.id !== sessionId) return session;
                const existingRunMessage = session.messages.find((message) => message.runId === runId && message.role === "assistant");
                if (existingRunMessage) runtimeAssistantId = existingRunMessage.id;
                return {
                  ...session,
                  serverSessionId,
                  messages: existingRunMessage ? session.messages.map((message) => message.id === existingRunMessage.id ? {
                    ...message,
                    content: "已收到补充信息，正在继续执行…",
                    status: "running" as const,
                  } : message) : [...session.messages, {
                    id: runtimeAssistantId,
                    role: "assistant" as const,
                    content: "已接收任务，正在开始执行…",
                    createdAt,
                    runId,
                    status: "running" as const,
                    events: [],
                  }],
                  updatedAt: createdAt,
                };
              }),
            },
          }));
          void get().save();
        },
        onEvent: (event) => {
          const runtimeStatus = event.type === "approval_required" ? "waiting_approval"
            : event.type === "waiting_user" ? "waiting_user"
            : event.type === "completed" ? "succeeded"
            : event.type === "failed" ? "failed"
            : event.type === "cancelled" ? "cancelled"
            : "running";
          set((s) => ({
            npcs: assignedBuildingId && s.npcs[assignedBuildingId] ? {
              ...s.npcs,
              [assignedBuildingId]: {
                ...s.npcs[assignedBuildingId],
                runtimeStatus,
                mood: runtimeStatus === "succeeded" ? "happy" : runtimeStatus === "waiting_approval" || runtimeStatus === "waiting_user" ? "curious" : runtimeStatus === "running" ? "busy" : "idle",
              },
            } : s.npcs,
            characterChatSessions: {
              ...s.characterChatSessions,
              [characterId]: (s.characterChatSessions[characterId] ?? []).map((session) => {
                if (session.id !== sessionId) return session;
                return {
                  ...session,
                  messages: session.messages.map((message) => {
                    if (message.id !== runtimeAssistantId) return message;
                    const events = message.events?.some((item) => item.id === event.id)
                      ? message.events
                      : [...(message.events ?? []), event];
                    const status = event.type === "approval_required" ? "waiting_approval"
                      : event.type === "waiting_user" ? "waiting_user"
                      : event.type === "completed" ? "succeeded"
                      : event.type === "failed" ? "failed"
                      : event.type === "cancelled" ? "cancelled"
                      : event.type === "approval_resolved" || (event.type === "running" && message.status === "waiting_approval") ? "running"
                      : message.status;
                    const content = event.type === "approval_required" ? "等待你批准后继续执行。"
                      : event.type === "approval_resolved" ? "审批已处理，正在继续执行…"
                      : event.type === "waiting_user" ? String(event.data?.message ?? "需要你补充信息后继续。")
                      : event.type === "failed" ? `执行失败：${String(event.data?.error ?? "模型或工具调用失败。")}`
                      : event.type === "cancelled" ? "已停止执行。"
                      : message.content;
                    return { ...message, events, status, content };
                  }),
                };
              }),
            },
          }));
        },
      });
      set((s) => ({
        chatStatus: "idle",
        npcs: assignedBuildingId && s.npcs[assignedBuildingId] ? {
          ...s.npcs,
          [assignedBuildingId]: { ...s.npcs[assignedBuildingId], runtimeStatus: result.status, mood: result.status === "succeeded" ? "happy" : result.status === "waiting_user" ? "curious" : "idle" },
        } : s.npcs,
        characterChatSessions: {
          ...s.characterChatSessions,
          [characterId]: (s.characterChatSessions[characterId] ?? []).map((session) => {
            if (session.id !== sessionId) return session;
            return {
              ...session,
              serverSessionId: result.sessionId,
              messages: session.messages.map((message) => message.id === runtimeAssistantId ? {
                ...message,
                content: result.message,
                runId: result.runId,
                status: result.status,
                events: [...(message.events ?? []), ...result.events.filter((event) => !(message.events ?? []).some((item) => item.id === event.id))],
                citations: result.citations,
              } : message),
              updatedAt: new Date().toISOString(),
            };
          }),
        },
      }));
      void get().save();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Character brain request failed.";
      set((s) => ({
        chatStatus: "error",
        chatError: errorMessage,
        npcs: assignedBuildingId && s.npcs[assignedBuildingId] ? {
          ...s.npcs,
          [assignedBuildingId]: { ...s.npcs[assignedBuildingId], runtimeStatus: "failed", mood: "idle" },
        } : s.npcs,
        characterChatSessions: {
          ...s.characterChatSessions,
          [characterId]: (s.characterChatSessions[characterId] ?? []).map((session) => session.id !== sessionId ? session : {
            ...session,
            messages: session.messages.map((message) => message.id !== runtimeAssistantId ? message : {
              ...message,
              content: `执行失败：${errorMessage}`,
              status: "failed" as const,
            }),
            updatedAt: new Date().toISOString(),
          }),
        },
      }));
      void get().save();
    }
  },

  assignResident: (buildingId, characterId) => {
    set((s) => {
      const nextResidents = assignUniqueResident(s.buildingResidents, buildingId, characterId);
      const previousBuildingIds = Object.entries(s.buildingResidents)
        .filter(([id, assignedCharacterId]) => id !== buildingId && assignedCharacterId === characterId)
        .map(([id]) => id);
      const nextNpcs = { ...s.npcs };
      delete nextNpcs[buildingId];
      previousBuildingIds.forEach((id) => delete nextNpcs[id]);
      const character = getCharacterById(characterId, s.customCharacters);
      const building = s.buildings.find((b) => b.id === buildingId);
      if (character && building) {
        nextNpcs[buildingId] = {
          presence: "home",
          x: building.x,
          y: building.y,
          line: character.homeLine,
          mood: "idle",
        };
      }
      return {
        buildingResidents: nextResidents,
        npcs: nextNpcs,
        characterLibraryBuildingId: null,
        characterChatCharacterId: null,
        themeHallOpen: false,
      };
    });
    syncSkillHallManagedWorkspaces(set, get);
    void get().save();
  },

  sendNpcWalking: (buildingId) => {
    const { buildings, buildingResidents, grid, customCharacters } = get();
    const building = buildings.find((b) => b.id === buildingId);
    if (!building) return;
    const resident = getAssignedResident(building, buildingResidents, customCharacters);
    if (!resident) return;
    const size = getPlacedBuildingSize(building, buildingTypes);
    const terrainGrid = {
      cols: grid.cols * TERRAIN_SUBDIV,
      rows: grid.rows * TERRAIN_SUBDIV,
    };
    const spawn = findNpcSpawnPoint(
      { x: building.x * TERRAIN_SUBDIV, y: building.y * TERRAIN_SUBDIV },
      [size[0] * TERRAIN_SUBDIV, size[1] * TERRAIN_SUBDIV],
      terrainGrid,
      get()
    );
    if (!spawn) {
      const needsPath = !get().allowNpcOffRoad;
      set((s) => ({
        npcs: {
          ...s.npcs,
          [buildingId]: {
            presence: "home",
            x: building.x,
            y: building.y,
            line: needsPath
              ? "请先在门口附近铺一些“地砖地形”里的可走贴花，或者在设置里允许 NPC 在非地砖上行走。"
              : "我想出去，但建筑周围暂时没有可站立的位置。可以挪开遮挡物，或开启“排除建筑碰撞体积”。",
            mood: "idle",
          },
        },
      }));
      return;
    }
    set((s) => ({
      npcs: {
        ...s.npcs,
        [buildingId]: {
          presence: "walking",
          x: spawn.x,
          y: spawn.y,
          direction: "down",
          line: resident.walkingLine,
          mood: "curious",
        },
      },
    }));
    void get().save();
  },

  returnNpcHome: (buildingId) => {
    const { buildings, buildingResidents, customCharacters } = get();
    const building = buildings.find((b) => b.id === buildingId);
    if (!building) return;
    const resident = getAssignedResident(building, buildingResidents, customCharacters);
    set((s) => ({
      npcs: {
        ...s.npcs,
        [buildingId]: {
          presence: "home",
          x: building.x,
          y: building.y,
          line: resident?.homeLine,
          mood: "idle",
        },
      },
    }));
    void get().save();
  },

  stepWalkingNpcs: () => {
    const { buildings, grid, npcs } = get();
    const next = { ...npcs };
    let changed = false;
    for (const [buildingId, npc] of Object.entries(npcs)) {
      if (npc.presence !== "walking") continue;
      const building = buildings.find((b) => b.id === buildingId);
      if (!building) continue;
      const terrainGrid = {
        cols: grid.cols * TERRAIN_SUBDIV,
        rows: grid.rows * TERRAIN_SUBDIV,
      };
      const home = { x: building.x * TERRAIN_SUBDIV, y: building.y * TERRAIN_SUBDIV };
      const buildingSize = getPlacedBuildingSize(building, buildingTypes);
      const size: [number, number] = [
        buildingSize[0] * TERRAIN_SUBDIV,
        buildingSize[1] * TERRAIN_SUBDIV,
      ];
      const current = { x: npc.x, y: npc.y };
      if (!isWalkableTerrainPoint(current, get())) {
        const respawn = createNpcSpawn(home, size, terrainGrid, (point) =>
          isWalkableTerrainPoint(point, get())
        );
        if (respawn) {
          next[buildingId] = { ...npc, ...respawn, direction: npc.direction ?? "down" };
          changed = true;
        }
        continue;
      }
      const point = nextNpcWalkPosition(
        current,
        home,
        size,
        terrainGrid,
        () => preferredNpcDirectionRandom(npc.direction),
        (point) => isWalkableTerrainPoint(point, get()),
        { homeRadius: null }
      );
      if (point.x !== npc.x || point.y !== npc.y) {
        next[buildingId] = {
          ...npc,
          ...point,
          direction: getNpcWalkDirection(npc, point),
        };
        changed = true;
      }
    }
    if (changed) set({ npcs: next });
  },

  openSkillHall: () =>
    set({
      skillHallOpen: true,
      selectedId: null,
      activeTerrain: null,
      activeDecoration: null,
      characterLibraryBuildingId: null,
      characterConfigCharacterId: null,
      characterChatCharacterId: null,
      bookmarkManagerBuildingId: null,
      settingsOpen: false,
      cityHallOpen: false,
      serverDashboardOpen: false,
      themeHallOpen: false,
      todoHallOpen: false,
    }),

  closeSkillHall: () => set({ skillHallOpen: false }),

  openSettings: () =>
    set({
      settingsOpen: true,
      selectedId: null,
      activeTerrain: null,
      activeDecoration: null,
      characterLibraryBuildingId: null,
      characterConfigCharacterId: null,
      characterChatCharacterId: null,
      bookmarkManagerBuildingId: null,
      skillHallOpen: false,
      cityHallOpen: false,
      serverDashboardOpen: false,
      themeHallOpen: false,
    }),

  closeSettings: () => set({ settingsOpen: false }),

  openCityHall: () =>
    set({
      cityHallOpen: true,
      selectedId: null,
      activeTerrain: null,
      activeDecoration: null,
      characterLibraryBuildingId: null,
      characterConfigCharacterId: null,
      characterChatCharacterId: null,
      bookmarkManagerBuildingId: null,
      skillHallOpen: false,
      settingsOpen: false,
      serverDashboardOpen: false,
      themeHallOpen: false,
    }),

  closeCityHall: () => set({ cityHallOpen: false }),

  openServerDashboard: () =>
    set({
      serverDashboardOpen: true,
      selectedId: null,
      activeTerrain: null,
      activeDecoration: null,
      characterLibraryBuildingId: null,
      characterConfigCharacterId: null,
      characterChatCharacterId: null,
      bookmarkManagerBuildingId: null,
      skillHallOpen: false,
      settingsOpen: false,
      cityHallOpen: false,
      themeHallOpen: false,
      todoHallOpen: false,
    }),

  closeServerDashboard: () => set({ serverDashboardOpen: false }),

  openThemeHall: () =>
    set({
      themeHallOpen: true,
      selectedId: null,
      activeTerrain: null,
      activeDecoration: null,
      characterLibraryBuildingId: null,
      characterConfigCharacterId: null,
      characterChatCharacterId: null,
      bookmarkManagerBuildingId: null,
      skillHallOpen: false,
      settingsOpen: false,
      cityHallOpen: false,
      serverDashboardOpen: false,
      todoHallOpen: false,
    }),

  closeThemeHall: () => set({ themeHallOpen: false }),

  openTodoHall: () =>
    set({
      todoHallOpen: true,
      selectedId: null,
      activeTerrain: null,
      activeDecoration: null,
      characterLibraryBuildingId: null,
      characterConfigCharacterId: null,
      characterChatCharacterId: null,
      bookmarkManagerBuildingId: null,
      skillHallOpen: false,
      settingsOpen: false,
      cityHallOpen: false,
      serverDashboardOpen: false,
      themeHallOpen: false,
    }),

  closeTodoHall: () => set({ todoHallOpen: false }),

  installSkill: (skillId) =>
    set((s) => {
      if (s.installedSkillIds.includes(skillId)) return s;
      return { installedSkillIds: [...s.installedSkillIds, skillId] };
    }),

  addInstalledSkill: (skill) => {
    set((s) => {
      const skillId = skill.id || skill.slug || skill.name;
      const nextSkill = { ...skill, id: skillId, slug: skill.slug ?? skillId };
      return {
        installedSkills: [
          nextSkill,
          ...s.installedSkills.filter((item) => item.id !== skillId && item.slug !== nextSkill.slug),
        ],
        installedSkillIds: s.installedSkillIds.includes(skillId)
          ? s.installedSkillIds
          : [...s.installedSkillIds, skillId],
      };
    });
    void get().save();
  },

  updateInstalledSkill: (skillId, patch) => {
    const updatedCharacterIds: string[] = [];
    set((s) => {
      const currentSkill = s.installedSkills.find((skill) => skill.id === skillId || skill.slug === skillId);
      const matchingIds = new Set(
        [skillId, currentSkill?.id, currentSkill?.slug].filter(Boolean) as string[]
      );
      const learnedSkillPatch = {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
        ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
        ...(patch.sourceUrl !== undefined ? { sourceUrl: patch.sourceUrl } : {}),
        ...(patch.commitSha !== undefined ? { commitSha: patch.commitSha } : {}),
        ...(patch.contentHash !== undefined ? { contentHash: patch.contentHash } : {}),
        ...(patch.requestedCapabilities !== undefined
          ? { requestedCapabilities: patch.requestedCapabilities }
          : {}),
      };
      const characterConfigs = Object.fromEntries(
        Object.entries(s.characterConfigs).map(([characterId, config]) => {
          let changed = false;
          const learnedSkills = (config.learnedSkills ?? []).map((skill) => {
            if (!matchingIds.has(skill.id) && !matchingIds.has(skill.slug)) return skill;
            changed = true;
            return { ...skill, ...learnedSkillPatch };
          });
          if (!changed) return [characterId, config];
          updatedCharacterIds.push(characterId);
          return [characterId, { ...config, learnedSkills }];
        })
      );

      return {
        installedSkills: s.installedSkills.map((skill) =>
          matchingIds.has(skill.id) || matchingIds.has(skill.slug ?? "") ? { ...skill, ...patch } : skill
        ),
        characterConfigs,
      };
    });
    updatedCharacterIds.forEach((characterId) => {
      const config = get().characterConfigs[characterId];
      if (config) persistAgentConfig(characterId, config);
    });
    void get().save();
  },

  removeInstalledSkill: async (skillId) => {
    set((s) => {
      const removed = s.installedSkills.find((skill) => skill.id === skillId || skill.slug === skillId);
      const ids = new Set([skillId, removed?.id, removed?.slug].filter(Boolean) as string[]);
      const nextConfigs = Object.fromEntries(
        Object.entries(s.characterConfigs).map(([characterId, config]) => {
          const learnedSkills = (config.learnedSkills ?? []).filter(
            (skill) => !ids.has(skill.id) && !ids.has(skill.slug ?? "")
          );
          const skillEnabledById = { ...(config.skillEnabledById ?? {}) };
          ids.forEach((id) => delete skillEnabledById[id]);
          const nextConfig = {
            ...config,
            learnedSkills,
            learnedSkillIds: learnedSkills.map((skill) => skill.id),
            skillEnabledById,
          };
          return [characterId, nextConfig];
        })
      );
      return {
        characterConfigs: nextConfigs,
        installedSkills: s.installedSkills.filter((skill) => !ids.has(skill.id) && !ids.has(skill.slug ?? "")),
        installedSkillIds: s.installedSkillIds.filter((id) => !ids.has(id)),
      };
    });
    try {
      const agents = await deleteSkillFromAgents(skillId);
      set((s) => ({
        characterConfigs: {
          ...s.characterConfigs,
          ...agents,
        },
      }));
    } catch {
      const configs = get().characterConfigs;
      Object.entries(configs).forEach(([characterId, config]) => persistAgentConfig(characterId, config));
    }
    void get().save();
  },

  createSkillGroup: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return "";
    const id = `skill-group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({
      skillGroups: [...s.skillGroups, { id, name: trimmed, createdAt: new Date().toISOString() }],
    }));
    void get().save();
    return id;
  },

  renameSkillGroup: (groupId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((s) => ({
      skillGroups: s.skillGroups.map((group) => group.id === groupId ? { ...group, name: trimmed } : group),
    }));
    void get().save();
  },

  removeSkillGroup: (groupId) => {
    set((s) => ({
      skillGroups: s.skillGroups.filter((group) => group.id !== groupId),
      installedSkills: s.installedSkills.map((skill) => skill.groupId === groupId ? { ...skill, groupId: undefined } : skill),
    }));
    void get().save();
  },

  assignSkillToGroup: (skillId, groupId) => {
    set((s) => ({
      installedSkills: s.installedSkills.map((skill) =>
        skill.id === skillId || skill.slug === skillId
          ? { ...skill, groupId: groupId || undefined }
          : skill
      ),
    }));
    void get().save();
  },

  installUrlSkillForCharacters: async (characterIds, skill) => {
    set({ skillLearningProgress: { active: true, label: "准备学习材料", percent: 12 } });
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    set({ skillLearningProgress: { active: true, label: "写入 Agent 技能目录", percent: 48 } });
    const agents = await installSkillForAgentFiles(characterIds, skill);
    set({ skillLearningProgress: { active: true, label: "更新 Agent 配置", percent: 82 } });
    set((s) => ({
      characterConfigs: {
        ...s.characterConfigs,
        ...agents,
      },
      installedSkillIds: s.installedSkillIds.includes(skill.slug)
        ? s.installedSkillIds
        : [...s.installedSkillIds, skill.slug],
    }));
    set({ skillLearningProgress: { active: true, label: "学习完成", percent: 100 } });
    window.setTimeout(() => set({ skillLearningProgress: { active: false, label: "", percent: 0 } }), 900);
    void get().save();
  },

  showLaunchToast: (message) => {
    set({ launchToast: message });
    window.setTimeout(() => {
      if (get().launchToast === message) set({ launchToast: null });
    }, 1600);
  },

  setCityName: (name) => set({ cityName: name }),

  setManagementLanguage: (language) => set({ managementLanguage: language }),

  setCityLordName: (name) => set({ cityLordName: name }),
  setShowBuildingStatusIndicators: (show) => set({ showBuildingStatusIndicators: show }),
  setShowBuildingLabels: (show) => set({ showBuildingLabels: show }),
  setThemeMode: (mode) => set({ themeMode: mode }),
  setTimeOfDay: (timeOfDay) => set({ timeOfDay }),
  setNpcMovementOptions: (patch) => set(patch),
  setGlanceDashboardUrl: (url) => set({ glanceDashboardUrl: url.trim() }),
  addDeviceIntegration: (device) =>
    set((s) => ({
      deviceIntegrations: [
        {
          id: `device-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: device.name.trim() || "New device",
          url: device.url.trim(),
          status: "unknown",
        },
        ...s.deviceIntegrations,
      ],
    })),
  updateDeviceIntegration: (id, patch) =>
    set((s) => ({
      deviceIntegrations: s.deviceIntegrations.map((device) =>
        device.id === id ? { ...device, ...patch } : device
      ),
    })),
  removeDeviceIntegration: (id) =>
    set((s) => ({
      deviceIntegrations: s.deviceIntegrations.filter((device) => device.id !== id),
    })),
  installThemePack: (pack) =>
    set((s) => ({
      installedThemePacks: [
        { ...pack, installedAt: pack.installedAt ?? new Date().toISOString() },
        ...s.installedThemePacks.filter((item) => item.id !== pack.id),
      ],
      customAssets: mergeCustomAssets(s.customAssets, getThemePackAssets(pack)),
    })),
  save: async () => {
    set({ saveStatus: "saving" });
    const {
      grid,
      buildings,
      decorations,
      npcs,
      buildingResidents,
      characterConfigs,
      customCharacters,
      characterChats,
      characterChatSessions,
      activeCharacterChatSessionIds,
      installedSkillIds,
      installedSkills,
      skillGroups,
      buildingBookmarks,
      buildingTasks,
      customAssets,
      placedCustomAssets,
      blockedWalkCells,
      mapSurrounding,
      ground,
      cityName,
      managementLanguage,
      cityLordName,
      showBuildingStatusIndicators,
      showBuildingLabels,
      themeMode,
      timeOfDay,
      allowNpcOffRoad,
      ignoreBuildingCollisionForNpc,
      installedThemePacks,
      activeThemePackId,
      glanceDashboardUrl,
      deviceIntegrations,
      layoutSchemes,
      activeLayoutSchemeId,
    } = get();
    try {
      await saveLayout({
        grid,
        buildings,
        decorations,
        npcs,
        buildingResidents,
        characterConfigs,
        customCharacters,
        characterChats,
        characterChatSessions,
        activeCharacterChatSessionIds,
        installedSkillIds,
        installedSkills,
        skillGroups,
        buildingBookmarks,
        buildingTasks,
        customAssets,
        placedCustomAssets,
        blockedWalkCells,
        blockedWalkResolution: 1,
        mapSurrounding,
        ground,
        groundResolution: TERRAIN_SUBDIV,
        cityName,
        managementLanguage,
        cityLordName,
        showBuildingStatusIndicators,
        showBuildingLabels,
        themeMode,
        timeOfDay,
        allowNpcOffRoad,
        ignoreBuildingCollisionForNpc,
        installedThemePacks,
        activeThemePackId,
        glanceDashboardUrl,
        deviceIntegrations,
        layoutSchemes,
        activeLayoutSchemeId,
      });
      set({ saveStatus: "saved" });
      setTimeout(() => set({ saveStatus: "idle" }), 1500);
    } catch {
      set({ saveStatus: "error" });
    }
  },

  replaceLayout: (layout) => {
    const installedThemePacks = normalizeInstalledThemePacks(layout.installedThemePacks);
    const normalizedBuildings = normalizeBuildings(layout.buildings);
    const buildingsBeforeCollisionRepair = ensureDefaultSystemBuildings(normalizedBuildings, DEFAULT_GRID);
    const buildings = resolveOverlappingBuildings(buildingsBeforeCollisionRepair);
    const customCharacters = layout.customCharacters ?? [];
    const { characterChatSessions, activeCharacterChatSessionIds } =
      migrateCharacterChatSessions(layout);
    set({
      grid: DEFAULT_GRID,
      buildings,
      decorations: layout.decorations ?? [],
      npcs: normalizeNpcStates(layout.npcs),
      buildingResidents: createDefaultBuildingResidents(buildings, layout.buildingResidents, customCharacters),
      characterConfigs: createDefaultCharacterConfigs(layout.characterConfigs, customCharacters),
      customCharacters,
      characterChats: {},
      characterChatSessions,
      activeCharacterChatSessionIds,
      installedSkillIds: layout.installedSkillIds ?? [],
      installedSkills: layout.installedSkills ?? [],
      skillGroups: layout.skillGroups ?? [],
      buildingBookmarks: layout.buildingBookmarks ?? {},
      buildingTasks: layout.buildingTasks ?? {},
      customAssets: mergeCustomAssets(
        getAvailableProjectAssets(installedThemePacks),
        filterAvailableProjectAssets(layout.customAssets ?? [], installedThemePacks)
      ),
      placedCustomAssets: normalizePlacedCustomAssets(layout.placedCustomAssets),
      blockedWalkCells: normalizeBlockedWalkCells(layout),
      mapSurrounding: layout.mapSurrounding ?? "megalithic",
      ground: migrateGround(layout),
      cityName: layout.cityName ?? "Agent City",
      managementLanguage: layout.managementLanguage ?? "zh-CN",
      cityLordName: layout.cityLordName ?? "",
      showBuildingStatusIndicators: layout.showBuildingStatusIndicators ?? true,
      showBuildingLabels: layout.showBuildingLabels ?? true,
      themeMode: layout.themeMode ?? "system",
      timeOfDay: layout.timeOfDay ?? "auto",
      allowNpcOffRoad: layout.allowNpcOffRoad ?? false,
      ignoreBuildingCollisionForNpc: layout.ignoreBuildingCollisionForNpc ?? false,
      installedThemePacks,
      activeThemePackId: layout.activeThemePackId ?? null,
      glanceDashboardUrl: layout.glanceDashboardUrl ?? "",
      deviceIntegrations: layout.deviceIntegrations ?? [],
      layoutSchemes: normalizeLayoutSchemes(layout.layoutSchemes),
      activeLayoutSchemeId: layout.activeLayoutSchemeId ?? null,
    });
    syncSkillHallManagedWorkspaces(set, get);
  },

  exportCurrent: () => {
    const {
      grid,
      buildings,
      decorations,
      npcs,
      buildingResidents,
      characterConfigs,
      customCharacters,
      characterChats,
      characterChatSessions,
      activeCharacterChatSessionIds,
      installedSkillIds,
      installedSkills,
      skillGroups,
      buildingBookmarks,
      buildingTasks,
      customAssets,
      placedCustomAssets,
      blockedWalkCells,
      mapSurrounding,
      ground,
      cityName,
      managementLanguage,
      cityLordName,
      showBuildingStatusIndicators,
      showBuildingLabels,
      themeMode,
      timeOfDay,
      allowNpcOffRoad,
      ignoreBuildingCollisionForNpc,
      installedThemePacks,
      activeThemePackId,
      glanceDashboardUrl,
      deviceIntegrations,
      layoutSchemes,
      activeLayoutSchemeId,
    } =
      get();
    return {
      grid,
      buildings,
      decorations,
      npcs,
      buildingResidents,
      characterConfigs,
      customCharacters,
      characterChats,
      characterChatSessions,
      activeCharacterChatSessionIds,
      installedSkillIds,
      installedSkills,
      skillGroups,
      buildingBookmarks,
      buildingTasks,
      customAssets,
      placedCustomAssets,
      blockedWalkCells,
      blockedWalkResolution: 1,
      mapSurrounding,
      ground,
      groundResolution: TERRAIN_SUBDIV,
      cityName,
      managementLanguage,
      cityLordName,
      showBuildingStatusIndicators,
      showBuildingLabels,
      themeMode,
      timeOfDay,
      allowNpcOffRoad,
      ignoreBuildingCollisionForNpc,
      installedThemePacks,
      activeThemePackId,
      glanceDashboardUrl,
      deviceIntegrations,
      layoutSchemes,
      activeLayoutSchemeId,
    };
  },
}));
