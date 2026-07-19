import type { BuildingType, PlacedBuilding } from "../types";
import { inferThemeBuildingSize } from "./customBuildingSize";

// The city uses a small isometric ground unit. Buildings occupy several of
// these units, so their artwork stays large while placement remains precise.
export const CELL_SIZE = 34;
export const ISO_CELL_WIDTH = 34;
export const ISO_CELL_HEIGHT = 17;
export const ISO_SCENE_WIDTH = 2040;
export const ISO_SCENE_HEIGHT = 1240;
export const ISO_ORIGIN_X = ISO_SCENE_WIDTH / 2;
export const ISO_ORIGIN_Y = -1020;

// Terrain paints at a finer resolution than buildings sit on: each building
// cell is divided into TERRAIN_SUBDIV x TERRAIN_SUBDIV ground tiles, so a
// path or water tile renders closer to its native ~64px source size instead
// of being stretched across a whole (now-larger) building cell.
export const TERRAIN_SUBDIV = 2;
export const TERRAIN_CELL_SIZE = CELL_SIZE / TERRAIN_SUBDIV;

export function isoToScreen(x: number, y: number) {
  return {
    x: ISO_ORIGIN_X + (x - y) * (ISO_CELL_WIDTH / 2),
    y: ISO_ORIGIN_Y + (x + y) * (ISO_CELL_HEIGHT / 2),
  };
}

export function screenToIso(px: number, py: number) {
  const diagonalX = (px - ISO_ORIGIN_X) / (ISO_CELL_WIDTH / 2);
  const diagonalY = (py - ISO_ORIGIN_Y) / (ISO_CELL_HEIGHT / 2);
  return {
    x: Math.round((diagonalX + diagonalY) / 2),
    y: Math.round((diagonalY - diagonalX) / 2),
  };
}

export function isoMapSize(cols: number, rows: number) {
  void cols;
  void rows;
  return {
    width: ISO_SCENE_WIDTH,
    height: ISO_SCENE_HEIGHT,
  };
}

export function getPlacedBuildingSize(
  building: PlacedBuilding,
  buildingTypes: Record<string, BuildingType>
): [number, number] {
  const inferredThemeSize = inferThemeBuildingSize(building.customImageUrl);
  if (inferredThemeSize && building.size?.[0] === 2 && building.size?.[1] === 2) {
    return inferredThemeSize;
  }
  return building.size ?? buildingTypes[building.type]?.size ?? [1, 1];
}

/** Does a building of the given size fit at (x, y) without falling off the grid? */
export function withinBounds(
  x: number,
  y: number,
  size: [number, number],
  grid: { cols: number; rows: number }
): boolean {
  return x >= 0 && y >= 0 && x + size[0] <= grid.cols && y + size[1] <= grid.rows;
}

/** Does a building of the given size at (x, y) overlap any existing building (excluding ignoreId)? */
export function overlaps(
  x: number,
  y: number,
  size: [number, number],
  buildings: PlacedBuilding[],
  buildingTypes: Record<string, BuildingType>,
  ignoreId?: string
): boolean {
  const aX2 = x + size[0];
  const aY2 = y + size[1];
  return buildings.some((b) => {
    if (b.id === ignoreId) return false;
    const bSize = getPlacedBuildingSize(b, buildingTypes);
    const bX2 = b.x + bSize[0];
    const bY2 = b.y + bSize[1];
    return x < bX2 && aX2 > b.x && y < bY2 && aY2 > b.y;
  });
}

export function canPlace(
  x: number,
  y: number,
  size: [number, number],
  grid: { cols: number; rows: number },
  buildings: PlacedBuilding[],
  buildingTypes: Record<string, BuildingType>,
  ignoreId?: string
): boolean {
  return (
    withinBounds(x, y, size, grid) &&
    !overlaps(x, y, size, buildings, buildingTypes, ignoreId)
  );
}
