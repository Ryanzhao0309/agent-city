import type { CustomSceneAsset, ThemePackDefinition } from "../types";

function projectAsset(
  kind: CustomSceneAsset["kind"],
  rel: string,
  name: string
): CustomSceneAsset {
  return {
    id: `project-${kind}-${rel}`,
    kind,
    name,
    url: `/${rel}`,
    source: "project",
  };
}

export const LOCAL_PROJECT_ASSETS: CustomSceneAsset[] = [
  projectAsset("terrain", "ground/walkable/tileable/lush-grass.png", "Lush Grass"),
  projectAsset("terrain", "ground/walkable/tileable/dark-moss-grass.png", "Dark Moss Grass"),
  projectAsset("terrain", "ground/walkable/tileable/compact-gravel.png", "Compact Gravel"),
  projectAsset("terrain", "ground/walkable/tileable/flat-cobblestone.png", "Flat Cobblestone"),
  projectAsset("terrain", "ground/walkable/tileable/flower-meadow.png", "Flower Meadow"),
  projectAsset("terrain", "ground/walkable/tileable/clover-patch.png", "Clover Patch"),
  projectAsset("terrain", "ground/walkable/tileable/dry-straw-grass.png", "Dry Straw Grass"),
  projectAsset("terrain", "ground/walkable/tileable/natural-stone-roads/straight.png", "自然石路 · 直路"),
  projectAsset("terrain", "ground/walkable/tileable/natural-stone-roads/corner.png", "自然石路 · 转角"),
  projectAsset("terrain", "ground/walkable/tileable/natural-stone-roads/t-junction.png", "自然石路 · 三岔"),
  projectAsset("terrain", "ground/walkable/tileable/natural-stone-roads/crossroads.png", "自然石路 · 十字"),
  projectAsset("terrain", "ground/walkable/tileable/natural-stone-roads/end-apron.png", "自然石路 · 门口端头"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-roads/path-straight-nw-se.png", "巨石小路 · 直路 ↘"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-roads/path-straight-ne-sw.png", "巨石小路 · 直路 ↙"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-roads/path-corner.png", "巨石小路 · 转角"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-roads/path-t-junction.png", "巨石小路 · 三岔"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-roads/path-crossroads.png", "巨石小路 · 十字"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-roads/path-end-apron.png", "巨石小路 · 门口端头"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-decor/broken-stone-path.png", "巨石 · 破碎石板路"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-decor/plaza-stone-ring.png", "巨石 · 圆形广场砖"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-decor/rune-circle-paving.png", "巨石 · 蓝色符文地砖"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-decor/entrance-semicircle-paving.png", "巨石 · 门口半圆铺装"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-decor/flower-grass-sprinkle.png", "巨石 · 碎花草地"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-decor/wood-plank-walkway.png", "巨石 · 水边木栈道"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-decor/stepping-stones-water-edge.png", "巨石 · 水边踏石"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-decor/mossy-stone-corner.png", "巨石 · 苔石边角"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-decor/mossy-border-strip.png", "巨石 · 苔石边条"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-decor/small-plaza-patch.png", "巨石 · 小型广场拼砖"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-decor/rune-stone-accent.png", "巨石 · 符文石点缀"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-decor/cracked-corner-paving.png", "巨石 · 破裂转角铺装"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-decor/grass-to-stone-transition.png", "巨石 · 草石过渡"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-decor/water-bank-stones.png", "巨石 · 水岸散石"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-decor/short-wood-bridge-patch.png", "巨石 · 短木桥补丁"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-decor/threshold-step-stones.png", "巨石 · 门口踏步石"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-decor/single-round-stone-block.png", "巨石 · 单块圆石板"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-decor/single-rune-slab.png", "巨石 · 单块符文石板"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-decor/paired-moss-stones.png", "巨石 · 双块苔石板"),
  projectAsset("terrain", "ground/walkable/tileable/megalithic-decor/pebble-edge-piece.png", "巨石 · 碎石边角块"),
  projectAsset("terrain", "ground/walkable/tileable/changan-city/imperial-brick-path.png", "长安 · 御街砖路"),
  projectAsset("terrain", "ground/walkable/tileable/changan-city/lantern-courtyard-paving.png", "长安 · 灯影庭院砖"),
  projectAsset("terrain", "ground/walkable/tileable/changan-city/willow-stone-border.png", "长安 · 柳叶石边"),
  projectAsset("terrain", "ground/walkable/tileable/changan-city/market-flagstone-patch.png", "长安 · 市集石板"),
  projectAsset("terrain", "ground/walkable/tileable/changan-city/lotus-round-paving.png", "长安 · 莲纹圆砖"),
  projectAsset("terrain", "ground/walkable/tileable/changan-city/single-blue-stone-slab.png", "长安 · 单块青石板"),
  projectAsset("terrain", "ground/walkable/tileable/sky-observatory/cloud-marble-tile.png", "天空 · 云纹白石砖"),
  projectAsset("terrain", "ground/walkable/tileable/sky-observatory/star-brass-inlay-path.png", "天空 · 星图铜线路"),
  projectAsset("terrain", "ground/walkable/tileable/sky-observatory/crystal-edge-stones.png", "天空 · 水晶石边"),
  projectAsset("terrain", "ground/walkable/tileable/sky-observatory/celestial-ring-paving.png", "天空 · 星象圆砖"),
  projectAsset("terrain", "ground/walkable/tileable/sky-observatory/sky-water-edge.png", "天空 · 星水边缘"),
  projectAsset("terrain", "ground/walkable/tileable/sky-observatory/single-crystal-slab.png", "天空 · 单块水晶白石"),
  projectAsset("decoration", "decorations/blocking/leafy-shrub.png", "Leafy Shrub"),
  projectAsset("decoration", "decorations/blocking/evergreen-cluster.png", "Evergreen Cluster"),
  projectAsset("decoration", "decorations/blocking/wildflower-bush.png", "Wildflower Bush"),
  projectAsset("decoration", "decorations/blocking/mossy-boulders.png", "Mossy Boulders"),
  projectAsset("decoration", "decorations/blocking/fallen-log.png", "Fallen Log"),
  projectAsset("decoration", "decorations/blocking/standing-stones.png", "Standing Stones"),
  projectAsset("decoration", "decorations/blocking/megalithic-decor/crystal-fountain.png", "巨石 · 蓝晶喷泉"),
  projectAsset("decoration", "decorations/blocking/megalithic-decor/crystal-lamp-post.png", "巨石 · 水晶路灯"),
  projectAsset("decoration", "decorations/blocking/megalithic-decor/wooden-bench.png", "巨石 · 木长椅"),
  projectAsset("decoration", "decorations/blocking/megalithic-decor/notice-board.png", "巨石 · 公告栏"),
  projectAsset("decoration", "decorations/blocking/megalithic-decor/flower-bed.png", "巨石 · 花坛"),
  projectAsset("decoration", "decorations/blocking/megalithic-decor/crates-and-barrels.png", "巨石 · 箱桶杂物"),
  projectAsset("decoration", "decorations/blocking/megalithic-decor/campfire-ring.png", "巨石 · 篝火圈"),
  projectAsset("decoration", "decorations/blocking/megalithic-decor/wooden-dock.png", "巨石 · 木平台"),
  projectAsset("decoration", "decorations/blocking/megalithic-decor/fishing-spot.png", "巨石 · 钓鱼点"),
  projectAsset("decoration", "decorations/blocking/megalithic-decor/signpost.png", "巨石 · 路牌"),
  projectAsset("decoration", "decorations/blocking/megalithic-decor/scroll-pile.png", "巨石 · 卷轴书堆"),
  projectAsset("decoration", "decorations/blocking/megalithic-decor/tool-cart.png", "巨石 · 工具推车"),
  projectAsset("decoration", "decorations/blocking/changan-city/01-palace-lantern-post.png", "长安 · 宫灯柱"),
  projectAsset("decoration", "decorations/blocking/changan-city/02-guardian-stone-lions.png", "长安 · 石狮门阶"),
  projectAsset("decoration", "decorations/blocking/changan-city/03-ceremonial-drum.png", "长安 · 礼鼓台"),
  projectAsset("decoration", "decorations/blocking/changan-city/04-willow-planter.png", "长安 · 柳树花池"),
  projectAsset("decoration", "decorations/blocking/changan-city/05-market-stall.png", "长安 · 市集摊"),
  projectAsset("decoration", "decorations/blocking/changan-city/06-imperial-flower-bed.png", "长安 · 御街花坛"),
  projectAsset("decoration", "decorations/blocking/sky-observatory/01-crystal-cluster.png", "天空水晶簇"),
  projectAsset("decoration", "decorations/blocking/sky-observatory/02-celestial-astrolabe.png", "星象仪"),
  projectAsset("decoration", "decorations/blocking/sky-observatory/03-crystal-light-pillar.png", "水晶灯柱"),
  projectAsset("decoration", "decorations/blocking/sky-observatory/04-sky-water-fountain.png", "天空水泉"),
  projectAsset("decoration", "decorations/blocking/sky-observatory/05-brass-telescope.png", "黄铜望远镜"),
  projectAsset("decoration", "decorations/blocking/sky-observatory/06-star-flower-bed.png", "星芒花坛"),
  projectAsset("building", "buildings/changan-pack/01-city-hall.png", "长安 · 市政大厅"),
  projectAsset("building", "buildings/changan-pack/02-agent-courtyard.png", "长安 · 智能体院落"),
  projectAsset("building", "buildings/changan-pack/03-task-notice-hall.png", "长安 · 待办告示厅"),
  projectAsset("building", "buildings/changan-pack/04-skill-academy.png", "长安 · 技能书院"),
  projectAsset("building", "buildings/changan-pack/05-archive-pagoda.png", "长安 · 档案塔楼"),
  projectAsset("building", "buildings/changan-pack/06-data-observatory.png", "长安 · 数据观星阁"),
  projectAsset("building", "buildings/changan-pack/07-server-ops-fort.png", "长安 · 服务器堡垒"),
  projectAsset("building", "buildings/changan-pack/08-lantern-theme-hall.png", "长安 · 灯市主题厅"),
  projectAsset("building", "buildings/changan-pack/09-custom-workshop.png", "长安 · 自定义工坊"),
  projectAsset("building", "buildings/sky-observatory-pack/01-city-hall.png", "天空 · 市政大厅"),
  projectAsset("building", "buildings/sky-observatory-pack/02-agent-home.png", "天空 · Agent 居所"),
  projectAsset("building", "buildings/sky-observatory-pack/03-task-hall.png", "天空 · 待办大厅"),
  projectAsset("building", "buildings/sky-observatory-pack/04-skill-academy.png", "天空 · 技能学院"),
  projectAsset("building", "buildings/sky-observatory-pack/05-archive-rotunda.png", "天空 · 档案圆厅"),
  projectAsset("building", "buildings/sky-observatory-pack/06-data-crystal-tower.png", "天空 · 数据水晶塔"),
  projectAsset("building", "buildings/sky-observatory-pack/07-server-observatory.png", "天空 · 服务器观测台"),
  projectAsset("building", "buildings/sky-observatory-pack/08-theme-gallery.png", "天空 · 主题展馆"),
  projectAsset("building", "buildings/sky-observatory-pack/09-custom-workshop.png", "天空 · 自定义工坊"),
];

const LOCAL_PROJECT_ASSETS_BY_ID = new Map(LOCAL_PROJECT_ASSETS.map((asset) => [asset.id, asset]));

export function localizeProjectAsset(asset: CustomSceneAsset): CustomSceneAsset {
  if (asset.source !== "project") return asset;
  const localAsset = LOCAL_PROJECT_ASSETS_BY_ID.get(asset.id);
  return localAsset ? { ...asset, name: localAsset.name } : asset;
}

export function localizeProjectAssets(assets: CustomSceneAsset[]): CustomSceneAsset[] {
  return assets.map(localizeProjectAsset);
}

const THEME_ASSET_PREFIXES: Record<string, string[]> = {
  "theme-megalithic-spring": [
    "/buildings/megalithic-single-pack/",
    "/buildings/custom/",
    "/ground/walkable/tileable/megalithic-roads/",
    "/ground/walkable/tileable/megalithic-decor/",
    "/decorations/blocking/megalithic-decor/",
  ],
  "theme-changan-city": [
    "/buildings/changan-pack/",
    "/ground/walkable/tileable/changan-city/",
    "/decorations/blocking/changan-city/",
  ],
  "theme-sky-observatory": [
    "/buildings/sky-observatory-pack/",
    "/ground/walkable/tileable/sky-observatory/",
    "/decorations/blocking/sky-observatory/",
  ],
};

export function getAssetThemePackId(asset: CustomSceneAsset): string | null {
  for (const [packId, prefixes] of Object.entries(THEME_ASSET_PREFIXES)) {
    if (prefixes.some((prefix) => asset.url.startsWith(prefix))) return packId;
  }
  return null;
}

function installedPackIds(installedThemePacks: ThemePackDefinition[] | undefined): Set<string> {
  return new Set((installedThemePacks ?? []).map((pack) => pack.id));
}

export function getProjectAssetsForThemePack(packId: string): CustomSceneAsset[] {
  return LOCAL_PROJECT_ASSETS.filter((asset) => getAssetThemePackId(asset) === packId);
}

export function getAvailableProjectAssets(
  installedThemePacks: ThemePackDefinition[] | undefined
): CustomSceneAsset[] {
  const installed = installedPackIds(installedThemePacks);
  return LOCAL_PROJECT_ASSETS.filter((asset) => {
    const packId = getAssetThemePackId(asset);
    return !packId || installed.has(packId);
  });
}

export function filterAvailableProjectAssets(
  assets: CustomSceneAsset[],
  installedThemePacks: ThemePackDefinition[] | undefined
): CustomSceneAsset[] {
  const installed = installedPackIds(installedThemePacks);
  return assets.filter((asset) => {
    if (asset.source !== "project") return true;
    const packId = getAssetThemePackId(asset);
    return !packId || installed.has(packId);
  });
}
