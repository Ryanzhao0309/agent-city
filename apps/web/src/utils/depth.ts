import { CELL_SIZE, TERRAIN_CELL_SIZE } from "./grid";

const DEPTH_BASE = 100;

export function buildingDepth({ x, y, size }: { x: number; y: number; size: [number, number] }): number {
  return DEPTH_BASE + Math.round((x + y + size[0] + size[1]) * CELL_SIZE);
}

export function npcDepth({ x, y }: { x: number; y: number }): number {
  return DEPTH_BASE + Math.round((x + y + 2) * TERRAIN_CELL_SIZE + CELL_SIZE * 2);
}
