import buildingTypesJson from "../data/buildingTypes.json";
import { SCENE_THEMES } from "../data/sceneThemes";
import { BUILDING_IMAGES, DECORATION_IMAGES, TERRAIN_TILES } from "../pixelArt/imageAssets";
import type { BuildingType, LayoutSchemeSnapshot, MapSurrounding } from "../types";
import { CELL_SIZE, ISO_SCENE_HEIGHT, ISO_SCENE_WIDTH, TERRAIN_SUBDIV, isoToScreen } from "./grid";

const PREVIEW_WIDTH = 520;
const PREVIEW_HEIGHT = 300;
const buildingTypes = Object.fromEntries(
  (buildingTypesJson as BuildingType[]).map((building) => [building.type, building])
) as Record<string, BuildingType>;
const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src || typeof window === "undefined") return Promise.resolve(null);
  const existing = imageCache.get(src);
  if (existing) return existing;
  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
  imageCache.set(src, promise);
  return promise;
}

function extractCssUrl(background: string): string | null {
  const match = background.match(/url\((['"]?)(.*?)\1\)/);
  return match?.[2] ?? null;
}

function coverImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function paintFallbackBackground(ctx: CanvasRenderingContext2D, themeId: MapSurrounding | undefined) {
  const gradient = ctx.createLinearGradient(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  const theme = themeId ?? "megalithic";
  if (theme === "volcanic-forge" || theme === "lava") {
    gradient.addColorStop(0, "#241513");
    gradient.addColorStop(0.5, "#4a2415");
    gradient.addColorStop(1, "#0f172a");
  } else if (theme === "polar-crystal") {
    gradient.addColorStop(0, "#dbeafe");
    gradient.addColorStop(0.55, "#5b8ba6");
    gradient.addColorStop(1, "#0f172a");
  } else if (theme === "changan-city") {
    gradient.addColorStop(0, "#4f3318");
    gradient.addColorStop(0.5, "#2f5a2c");
    gradient.addColorStop(1, "#0f172a");
  } else {
    gradient.addColorStop(0, "#254f26");
    gradient.addColorStop(0.5, "#5f8f38");
    gradient.addColorStop(1, "#0f3b45");
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
}

function screenPoint(x: number, y: number) {
  const point = isoToScreen(x, y);
  return {
    x: (point.x / ISO_SCENE_WIDTH) * PREVIEW_WIDTH,
    y: (point.y / ISO_SCENE_HEIGHT) * PREVIEW_HEIGHT,
  };
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string
) {
  ctx.beginPath();
  ctx.moveTo(x, y - height / 2);
  ctx.lineTo(x + width / 2, y);
  ctx.lineTo(x, y + height / 2);
  ctx.lineTo(x - width / 2, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawCoverTile(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  x: number,
  y: number,
  width: number,
  height: number,
  fallback: string
) {
  if (!image) {
    drawDiamond(ctx, x, y, width, height, fallback);
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y - height / 2);
  ctx.lineTo(x + width / 2, y);
  ctx.lineTo(x, y + height / 2);
  ctx.lineTo(x - width / 2, y);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, x - width / 2, y - height / 2, width, height);
  ctx.restore();
}

export async function generateLayoutPreview(snapshot: LayoutSchemeSnapshot): Promise<string> {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = PREVIEW_WIDTH;
  canvas.height = PREVIEW_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const theme = SCENE_THEMES[snapshot.mapSurrounding ?? "megalithic"];
  paintFallbackBackground(ctx, snapshot.mapSurrounding);
  const backgroundUrl = extractCssUrl(theme.background);
  if (backgroundUrl) {
    const background = await loadImage(backgroundUrl);
    if (background) coverImage(ctx, background, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  }

  ctx.fillStyle = "rgba(2,6,23,.18)";
  ctx.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);

  const terrainImageCache = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    Object.values(TERRAIN_TILES).map(async (url) => {
      terrainImageCache.set(url, await loadImage(url));
    })
  );

  const groundEntries = Object.entries(snapshot.ground ?? {}).slice(0, 1400);
  groundEntries.forEach(([key, terrain]) => {
    const [x, y] = key.split(",").map(Number);
    const point = screenPoint((x + 0.5) / TERRAIN_SUBDIV, (y + 0.5) / TERRAIN_SUBDIV);
    const tileUrl = TERRAIN_TILES[terrain];
    drawCoverTile(ctx, terrainImageCache.get(tileUrl) ?? null, point.x, point.y, 12, 6, "rgba(203,213,225,.55)");
  });

  const blockedEntries = Object.keys(snapshot.blockedWalkCells ?? {}).slice(0, 900);
  blockedEntries.forEach((key) => {
    const [x, y] = key.split(",").map(Number);
    const point = screenPoint(x + 0.5, y + 0.5);
    drawDiamond(ctx, point.x, point.y, 18, 9, "rgba(251,146,60,.58)");
  });

  const drawables: Array<{ depth: number; draw: () => Promise<void> }> = [];

  (snapshot.decorations ?? []).forEach((decoration) => {
    drawables.push({
      depth: decoration.x + decoration.y + 2,
      draw: async () => {
        const point = screenPoint(decoration.x + 1, decoration.y + 1);
        const image = await loadImage(DECORATION_IMAGES[decoration.type]);
        if (image) {
          ctx.drawImage(image, point.x - 18, point.y - 26, 36, 36);
        }
      },
    });
  });

  (snapshot.placedCustomAssets ?? []).forEach((asset) => {
    if (asset.kind === "terrain") {
      drawables.push({
        depth: asset.x / TERRAIN_SUBDIV + asset.y / TERRAIN_SUBDIV,
        draw: async () => {
          const image = await loadImage(asset.url);
          const point = screenPoint((asset.x + asset.width / 2) / TERRAIN_SUBDIV, (asset.y + asset.height / 2) / TERRAIN_SUBDIV);
          drawCoverTile(ctx, image, point.x, point.y, Math.max(12, asset.width * 6), Math.max(6, asset.height * 3), "rgba(203,213,225,.55)");
        },
      });
      return;
    }
    if (asset.kind === "decoration") {
      drawables.push({
        depth: asset.x / TERRAIN_SUBDIV + asset.y / TERRAIN_SUBDIV + asset.height / TERRAIN_SUBDIV,
        draw: async () => {
          const image = await loadImage(asset.url);
          if (!image) return;
          const point = screenPoint((asset.x + asset.width / 2) / TERRAIN_SUBDIV, (asset.y + asset.height / 2) / TERRAIN_SUBDIV);
          const width = Math.max(26, asset.width * 7);
          const height = Math.max(26, asset.height * 7);
          ctx.drawImage(image, point.x - width / 2, point.y - height, width, height);
        },
      });
    }
  });

  (snapshot.buildings ?? []).forEach((building) => {
    const size = building.size ?? buildingTypes[building.type]?.size ?? [5, 5];
    drawables.push({
      depth: building.x + building.y + size[0] + size[1],
      draw: async () => {
        const image = await loadImage(building.customImageUrl ?? BUILDING_IMAGES[building.type]);
        if (!image) return;
        const center = screenPoint(building.x + size[0] / 2, building.y + size[1] / 2);
        const visualWidth = Math.max(40, size[0] * (CELL_SIZE / 2.8));
        const visualHeight = Math.max(42, size[1] * (CELL_SIZE / 2.25));
        ctx.shadowColor = "rgba(0,0,0,.35)";
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 4;
        ctx.drawImage(image, center.x - visualWidth / 2, center.y - visualHeight * 0.82, visualWidth, visualHeight);
        ctx.shadowColor = "transparent";
        if (building.name) {
          ctx.font = "700 8px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(15,23,42,.72)";
          const textWidth = ctx.measureText(building.name).width + 10;
          const labelY = center.y + 9;
          ctx.fillRect(center.x - textWidth / 2, labelY - 8, textWidth, 12);
          ctx.fillStyle = "#f8fafc";
          ctx.fillText(building.name, center.x, labelY + 1);
        }
      },
    });
  });

  for (const drawable of drawables.sort((a, b) => a.depth - b.depth)) {
    await drawable.draw();
  }

  ctx.strokeStyle = "rgba(255,255,255,.22)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, PREVIEW_WIDTH - 2, PREVIEW_HEIGHT - 2);
  try {
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return "";
  }
}
