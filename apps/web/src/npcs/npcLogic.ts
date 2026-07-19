export interface GridSize {
  cols: number;
  rows: number;
}

export interface NpcPoint {
  x: number;
  y: number;
}

const WALK_RADIUS = 3;
type WalkablePredicate = (point: NpcPoint) => boolean;
type NpcWalkDirection = "down" | "right" | "up" | "left";

const NPC_WALK_DIRECTIONS: Array<{ x: number; y: number }> = [
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: 1, y: 1 },
  { x: -1, y: -1 },
];

interface NpcWalkOptions {
  homeRadius?: number | null;
}

export function clampNpcPosition(point: NpcPoint, grid: GridSize): NpcPoint {
  return {
    x: Math.max(0, Math.min(grid.cols - 1, point.x)),
    y: Math.max(0, Math.min(grid.rows - 1, point.y)),
  };
}

function isWithinNpcGrid(point: NpcPoint, grid: GridSize): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < grid.cols && point.y < grid.rows;
}

export function createNpcSpawn(
  home: NpcPoint,
  size: [number, number],
  grid: GridSize,
  isWalkable?: WalkablePredicate
): NpcPoint | null {
  const preferred = clampNpcPosition(
    {
      x: home.x + Math.floor(size[0] / 2),
      y: home.y + size[1],
    },
    grid
  );
  if (!isWalkable) return preferred;
  if (isWalkable(preferred)) return preferred;

  const center = {
    x: home.x + Math.floor(size[0] / 2),
    y: home.y + Math.floor(size[1] / 2),
  };
  const candidates: NpcPoint[] = [];
  for (let radius = 1; radius <= WALK_RADIUS + 2; radius++) {
    for (let y = center.y - radius; y <= center.y + radius; y++) {
      for (let x = center.x - radius; x <= center.x + radius; x++) {
        if (Math.max(Math.abs(x - center.x), Math.abs(y - center.y)) !== radius) continue;
        const point = clampNpcPosition({ x, y }, grid);
        if (candidates.some((candidate) => candidate.x === point.x && candidate.y === point.y)) continue;
        candidates.push(point);
      }
    }
    const found = candidates.find(isWalkable);
    if (found) return found;
  }
  return null;
}

export function nextNpcWalkPosition(
  current: NpcPoint,
  home: NpcPoint,
  size: [number, number],
  grid: GridSize,
  random: () => number = Math.random,
  isWalkable?: WalkablePredicate,
  options: NpcWalkOptions = {}
): NpcPoint {
  const startIndex = Math.min(NPC_WALK_DIRECTIONS.length - 1, Math.floor(random() * NPC_WALK_DIRECTIONS.length));
  const homeRadius = options.homeRadius === undefined ? WALK_RADIUS : options.homeRadius;
  const center =
    homeRadius === null
      ? null
      : {
          x: home.x + Math.floor(size[0] / 2),
          y: home.y + Math.floor(size[1] / 2),
        };

  for (let i = 0; i < NPC_WALK_DIRECTIONS.length; i++) {
    const direction = NPC_WALK_DIRECTIONS[(startIndex + i) % NPC_WALK_DIRECTIONS.length];
    const stepped = {
      x: current.x + direction.x,
      y: current.y + direction.y,
    };
    if (!isWithinNpcGrid(stepped, grid)) continue;
    if (
      center &&
      homeRadius !== null &&
      (stepped.x < center.x - homeRadius ||
        stepped.x > center.x + homeRadius ||
        stepped.y < center.y - homeRadius ||
        stepped.y > center.y + homeRadius)
    ) {
      continue;
    }
    if (!isWalkable || isWalkable(stepped)) return stepped;
  }
  return current;
}

export function getNpcWalkDirection(from: NpcPoint, to: NpcPoint): NpcWalkDirection {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return "down";

  const screenX = dx - dy;
  const screenY = dx + dy;
  if (Math.abs(screenX) >= Math.abs(screenY)) {
    return screenX > 0 ? "right" : "left";
  }
  return screenY > 0 ? "down" : "up";
}
