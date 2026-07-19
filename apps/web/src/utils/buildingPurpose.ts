import type { BuildingPurpose, PlacedBuilding } from "../types";

export const SYSTEM_PURPOSES = new Set<BuildingPurpose>([
  "city-hall",
  "skill-hall",
  "todo-hall",
  "server-manager",
  "theme-hall",
]);

export function inferBuildingPurpose(type: string): BuildingPurpose {
  if (type === "city-hall") return "city-hall";
  if (type === "skill-market") return "skill-hall";
  if (type === "task-hall") return "todo-hall";
  if (type === "server-room") return "server-manager";
  if (type === "theme-hall") return "theme-hall";
  if (type === "agent-home") return "agent-home";
  return "generic";
}

export function getBuildingPurpose(building: PlacedBuilding): BuildingPurpose {
  return building.purpose ?? inferBuildingPurpose(building.type);
}

export function isSystemPurpose(purpose: BuildingPurpose): boolean {
  return SYSTEM_PURPOSES.has(purpose);
}
