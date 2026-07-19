import type { DecorationType, TerrainType } from "../types";

/**
 * AI-generated building sprites, served from /public/buildings. Each source
 * image's own aspect ratio matches its building's grid footprint exactly
 * (256x256 for 1x1, 512x256 for 2x1, 512x512 for 2x2), and every sprite is
 * bottom-anchored with symmetric side margins - so rendering them with
 * object-fit: contain inside a same-ratio box lines them up on the grid
 * with no extra positioning math needed.
 */
export const BUILDING_IMAGES: Record<string, string> = {
  "city-hall": "/buildings/megalithic-single-pack/01-city-hall.png",
  "agent-home": "/buildings/megalithic-single-pack/02-agent-cottage.png",
  "task-hall": "/buildings/custom/todo-hall.png",
  "skill-market": "/buildings/megalithic-single-pack/03-skill-shrine.png",
  archive: "/buildings/megalithic-single-pack/04-archive-library.png",
  "data-center": "/buildings/megalithic-single-pack/06-data-rune-tower.png",
  "server-room": "/buildings/megalithic-single-pack/05-server-ops-observatory.png",
  "theme-hall": "/buildings/megalithic-single-pack/07-bookmark-hall.png",
  "custom-link": "/buildings/megalithic-single-pack/07-bookmark-hall.png",
};

export const GROUND_GRASS_URL = "/ground/walkable/grass-blend.png";
export const GROUND_TILE_SIZE = 64;

export const TERRAIN_TILES: Record<TerrainType, string> = {
  grass: "/ground/walkable/grass-blend.png",
  stone: "/ground/walkable/cobblestone-path.png",
  water: "/ground/walkable/water-edge.png",
  "lava-flow": "/ground/walkable/dirt-path.png",
  "lava-cracked": "/ground/walkable/mossy-stone-path.png",
};

export const TERRAIN_LABELS: Record<TerrainType, string> = {
  grass: "草地补丁",
  stone: "石板路",
  water: "浅水边缘",
  "lava-flow": "泥土小径",
  "lava-cracked": "苔石路",
};

export const DECORATION_IMAGES: Record<DecorationType, string> = {
  "tree-round": "/decorations/blocking/leafy-shrub.png",
  "tree-pine": "/decorations/blocking/evergreen-cluster.png",
  "tree-wide": "/decorations/blocking/wildflower-bush.png",
  "tree-dry": "/decorations/blocking/fallen-log.png",
  "shrub-cluster": "/decorations/blocking/mossy-boulders.png",
  "volcano-active": "/decorations/blocking/standing-stones.png",
  "volcano-dormant": "/decorations/blocking/mossy-boulders.png",
  "volcano-caldera": "/decorations/blocking/standing-stones.png",
};

export const DECORATION_LABELS: Record<DecorationType, string> = {
  "tree-round": "阔叶灌木",
  "tree-pine": "松树丛",
  "tree-wide": "花丛",
  "tree-dry": "倒木",
  "shrub-cluster": "苔石",
  "volcano-active": "立石",
  "volcano-dormant": "巨石",
  "volcano-caldera": "石阵",
};
