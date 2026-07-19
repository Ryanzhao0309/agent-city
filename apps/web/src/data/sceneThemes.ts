import type { MapSurrounding, TerrainType } from "../types";

export interface SceneTheme {
  id: MapSurrounding;
  label: string;
  shortLabel: string;
  description: string;
  /**
   * The playable city grid is placed inside the larger scene at these offsets.
   * Everything outside this rectangle belongs to the theme artwork: sea, forest,
   * lava cliffs, toy table, etc. Buildings and terrain painting only happen in
   * the buildable rectangle.
   */
  buildableInset: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  defaultTerrain: TerrainType;
  background: string;
  /**
   * Optional editable polygon inside the rectangular build grid. Coordinates
   * are normalized 0..1 relative to the build grid, and are used both for the
   * Build Mode visual mask and placement validation.
   */
  buildablePolygon?: Array<{ x: number; y: number }>;
}

export const SCENE_THEMES: Record<MapSurrounding, SceneTheme> = {
  plain: {
    id: "plain",
    label: "基础草地",
    shortLabel: "草地",
    description: "轻量默认场景，适合快速搭建。",
    buildableInset: { top: 96, right: 96, bottom: 96, left: 96 },
    defaultTerrain: "grass",
    background:
      "radial-gradient(circle at 18% 12%, rgba(45,212,191,0.08), transparent 28%), linear-gradient(145deg, #16351f, #0f172a)",
  },
  sea: {
    id: "sea",
    label: "海岛小镇",
    shortLabel: "海岛",
    description: "外围是完整海面和海岸，海水使用微弱循环序列帧。",
    buildableInset: { top: 230, right: 250, bottom: 250, left: 250 },
    defaultTerrain: "grass",
    background:
      "radial-gradient(circle at 28% 24%, rgba(125,211,252,0.36), transparent 18%), radial-gradient(circle at 78% 68%, rgba(14,165,233,0.28), transparent 20%), linear-gradient(135deg, #0e7490, #075985 48%, #0f172a)",
  },
  forest: {
    id: "forest",
    label: "森林海岸",
    shortLabel: "森林",
    description: "参考经典小镇外围，树林、岩石、海岸围绕中央建造区。",
    buildableInset: { top: 190, right: 230, bottom: 240, left: 250 },
    defaultTerrain: "grass",
    background:
      "radial-gradient(circle at 12% 16%, rgba(132,204,22,0.24), transparent 20%), radial-gradient(circle at 86% 18%, rgba(20,83,45,0.68), transparent 28%), radial-gradient(circle at 12% 86%, rgba(14,116,144,0.76), transparent 26%), linear-gradient(135deg, #1f3b21, #2f5a2c 42%, #15341f)",
  },
  megalithic: {
    id: "megalithic",
    label: "巨石阵春野",
    shortLabel: "巨石阵",
    description: "高清空白主题贴图：中央自然草坪可建造，外围是巨石阵、溪流、森林和山崖。",
    buildableInset: { top: 184, right: 392, bottom: 185, left: 392 },
    defaultTerrain: "grass",
    background: "url('/scene-themes/megalithic-spring.png') center / cover no-repeat",
  },
  lava: {
    id: "lava",
    label: "熔岩火山",
    shortLabel: "岩浆",
    description: "深色岩壁、熔岩河与热光外围，适合服务器/运维主题城市。",
    buildableInset: { top: 210, right: 240, bottom: 240, left: 240 },
    defaultTerrain: "stone",
    background:
      "radial-gradient(circle at 18% 88%, rgba(239,68,68,0.78), transparent 22%), radial-gradient(circle at 84% 16%, rgba(251,146,60,0.56), transparent 20%), linear-gradient(135deg, #1c1917, #4a2415 48%, #0f172a)",
  },
  undersea: {
    id: "undersea",
    label: "深海龙宫",
    shortLabel: "深海",
    description: "海底遗迹、珊瑚与蓝绿色水光，适合资料/知识型城市。",
    buildableInset: { top: 210, right: 245, bottom: 245, left: 245 },
    defaultTerrain: "stone",
    background:
      "radial-gradient(circle at 12% 18%, rgba(45,212,191,0.36), transparent 24%), radial-gradient(circle at 84% 80%, rgba(168,85,247,0.20), transparent 24%), linear-gradient(135deg, #083344, #155e75 44%, #0f172a)",
  },
  "toy-workshop": {
    id: "toy-workshop",
    label: "玩具工坊",
    shortLabel: "玩具",
    description: "桌面、灯串和木质工坊气氛，适合轻松的创意工作台。",
    buildableInset: { top: 190, right: 230, bottom: 235, left: 230 },
    defaultTerrain: "stone",
    background:
      "radial-gradient(circle at 18% 16%, rgba(253,186,116,0.32), transparent 28%), radial-gradient(circle at 88% 82%, rgba(248,113,113,0.30), transparent 24%), linear-gradient(135deg, #7c2d12, #b45309 48%, #431407)",
  },
  "changan-city": {
    id: "changan-city",
    label: "长安御街",
    shortLabel: "长安",
    description: "长安城御街、宫阙、水桥和灯市氛围的完整地图背景。",
    buildableInset: { top: 184, right: 392, bottom: 185, left: 392 },
    defaultTerrain: "stone",
    background: "url('/scene-themes/changan-city.png') center / cover no-repeat",
  },
  "sky-observatory": {
    id: "sky-observatory",
    label: "天空观星台",
    shortLabel: "天空",
    description: "云海浮岛、观星仪、蓝晶和古代遗迹构成的天空地图背景。",
    buildableInset: { top: 184, right: 392, bottom: 185, left: 392 },
    defaultTerrain: "grass",
    background: "url('/scene-themes/sky-observatory.png') center / cover no-repeat",
  },
  "volcanic-forge": {
    id: "volcanic-forge",
    label: "火山熔炉",
    shortLabel: "火山",
    description: "黑曜石峡谷、岩浆河和废弃熔炉构成的高反差地图背景。",
    buildableInset: { top: 184, right: 392, bottom: 185, left: 392 },
    defaultTerrain: "stone",
    background: "url('/scene-themes/volcanic-forge.png') center / cover no-repeat",
  },
  "polar-crystal": {
    id: "polar-crystal",
    label: "极地水晶",
    shortLabel: "极地",
    description: "雪原、冰河、极光和水晶遗迹构成的寒地地图背景。",
    buildableInset: { top: 184, right: 392, bottom: 185, left: 392 },
    defaultTerrain: "stone",
    background: "url('/scene-themes/polar-crystal.png') center / cover no-repeat",
  },
};

export const SCENE_THEME_OPTIONS = Object.values(SCENE_THEMES);

export function getSceneTheme(id: MapSurrounding): SceneTheme {
  return SCENE_THEMES[id] ?? SCENE_THEMES.plain;
}
