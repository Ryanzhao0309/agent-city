import { Fragment, forwardRef, useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { buildingTypes, useCityStore } from "../store/cityStore";
import { BuildingSprite } from "./BuildingSprite";
import { WalkingNpc } from "./WalkingNpc";
import { getSceneTheme } from "../data/sceneThemes";
import { CELL_SIZE, TERRAIN_SUBDIV, getPlacedBuildingSize, isoMapSize, isoToScreen, screenToIso } from "../utils/grid";
import {
  BUILDING_IMAGES,
  DECORATION_IMAGES,
  TERRAIN_TILES,
} from "../pixelArt/imageAssets";
import { isRoadAssetUrl } from "../utils/roadRotation";
import { getCustomBuildingSize } from "../utils/customBuildingSize";

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (node: T | null) => {
    refs.forEach((ref) => {
      if (!ref) return;
      if (typeof ref === "function") ref(node);
      else (ref as React.MutableRefObject<T | null>).current = node;
    });
  };
}

export interface DragPreview {
  x: number;
  y: number;
  size: [number, number];
  valid: boolean;
}

interface CityCanvasProps {
  dragPreview?: DragPreview | null;
}

interface AssetPreview {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "terrain" | "decoration" | "building";
  label: string;
  valid: boolean;
}

interface CopiedAssetPlacement {
  assetId: string;
  kind: "terrain" | "decoration";
  name: string;
  url: string;
  width: number;
  height: number;
}

type MapEditTool = "none" | "erase-terrain" | "block-walk-area" | "resize-object";

const BUILD_TOOL_PANEL_STORAGE_KEY = "agent-city-build-tool-panel";
const BUILD_TOOL_PANEL_MARGIN = 12;
const BUILD_TOOL_PANEL_DEFAULT_TOP = 122;

interface BuildToolPanelPreferences {
  x: number | null;
  y: number;
  collapsed: boolean;
}

export const CityCanvas = forwardRef<HTMLDivElement, CityCanvasProps>(({ dragPreview }, ref) => {
  const grid = useCityStore((s) => s.grid);
  const buildings = useCityStore((s) => s.buildings);
  const decorations = useCityStore((s) => s.decorations);
  const placedCustomAssets = useCityStore((s) => s.placedCustomAssets);
  const npcs = useCityStore((s) => s.npcs);
  const ground = useCityStore((s) => s.ground);
  const blockedWalkCells = useCityStore((s) => s.blockedWalkCells);
  const buildMode = useCityStore((s) => s.buildMode);
  const buildPreviewMode = useCityStore((s) => s.buildPreviewMode);
  const toggleBuildPreviewMode = useCityStore((s) => s.toggleBuildPreviewMode);
  const selectedId = useCityStore((s) => s.selectedId);
  const activeTerrain = useCityStore((s) => s.activeTerrain);
  const activeDecoration = useCityStore((s) => s.activeDecoration);
  const activeCustomAssetId = useCityStore((s) => s.activeCustomAssetId);
  const activeCustomAsset = useCityStore((s) =>
    s.customAssets.find((asset) => asset.id === s.activeCustomAssetId)
  );
  const mapSurrounding = useCityStore((s) => s.mapSurrounding);
  const saveEditingLayoutScheme = useCityStore((s) => s.saveEditingLayoutScheme);
  const saveStatus = useCityStore((s) => s.saveStatus);
  const clearCurrentLayoutDraft = useCityStore((s) => s.clearCurrentLayoutDraft);
  const showLaunchToast = useCityStore((s) => s.showLaunchToast);
  const paintGround = useCityStore((s) => s.paintGround);
  const eraseTerrainAt = useCityStore((s) => s.eraseTerrainAt);
  const clearAllTerrainTiles = useCityStore((s) => s.clearAllTerrainTiles);
  const toggleBlockedWalkCell = useCityStore((s) => s.toggleBlockedWalkCell);
  const placeDecoration = useCityStore((s) => s.placeDecoration);
  const placeCustomAsset = useCityStore((s) => s.placeCustomAsset);
  const placeCustomAssetInstance = useCityStore((s) => s.placeCustomAssetInstance);
  const removeCustomAsset = useCityStore((s) => s.removeCustomAsset);
  const moveCustomAsset = useCityStore((s) => s.moveCustomAsset);
  const resizeBuilding = useCityStore((s) => s.resizeBuilding);
  const resizeCustomAsset = useCityStore((s) => s.resizeCustomAsset);
  const setActiveTerrain = useCityStore((s) => s.setActiveTerrain);
  const setActiveDecoration = useCityStore((s) => s.setActiveDecoration);
  const selectCustomAsset = useCityStore((s) => s.selectCustomAsset);
  const stepWalkingNpcs = useCityStore((s) => s.stepWalkingNpcs);
  const selectBuilding = useCityStore((s) => s.selectBuilding);
  const launchToast = useCityStore((s) => s.launchToast);
  const buildEditing = buildMode && !buildPreviewMode;
  const { setNodeRef } = useDroppable({ id: "city-grid", disabled: !buildEditing });

  const viewportRef = useRef<HTMLDivElement>(null);
  const localRef = useRef<HTMLDivElement>(null);
  const isPaintingRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(
    null
  );
  const [zoom, setZoom] = useState(0.65);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panMode, setPanMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [assetPreview, setAssetPreview] = useState<AssetPreview | null>(null);
  const [copiedAssetPlacement, setCopiedAssetPlacement] = useState<CopiedAssetPlacement | null>(null);
  const [copiedAssetPreview, setCopiedAssetPreview] = useState<AssetPreview | null>(null);
  const [mapEditTool, setMapEditTool] = useState<MapEditTool>("none");
  const [selectedQuickAssetId, setSelectedQuickAssetId] = useState<string | null>(null);
  const [buildingsHidden, setBuildingsHidden] = useState(false);
  const [resizeMessage, setResizeMessage] = useState("");
  const [toolPanelPreferences, setToolPanelPreferences] = useState<BuildToolPanelPreferences>(() => {
    const fallback = { x: null, y: BUILD_TOOL_PANEL_DEFAULT_TOP, collapsed: window.innerWidth <= 720 };
    try {
      const saved = window.localStorage.getItem(BUILD_TOOL_PANEL_STORAGE_KEY);
      if (!saved) return fallback;
      const parsed = JSON.parse(saved) as Partial<BuildToolPanelPreferences>;
      return {
        x: typeof parsed.x === "number" ? parsed.x : null,
        y: typeof parsed.y === "number" ? parsed.y : fallback.y,
        collapsed: typeof parsed.collapsed === "boolean" ? parsed.collapsed : fallback.collapsed,
      };
    } catch {
      return fallback;
    }
  });
  const [toolPanelDragging, setToolPanelDragging] = useState(false);
  const [toolPanelDockTop, setToolPanelDockTop] = useState(0);
  const toolPanelRef = useRef<HTMLDivElement>(null);
  const toolPanelDragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const movingAssetRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const blockedDragModeRef = useRef<"block" | "unblock">("block");
  const mapEditDirtyRef = useRef(false);

  const isoSize = isoMapSize(grid.cols, grid.rows);
  const mapWidth = isoSize.width;
  const mapHeight = isoSize.height;
  const sceneTheme = getSceneTheme(mapSurrounding);
  const sceneWidth = mapWidth;
  const sceneHeight = mapHeight;
  const scaledSceneWidth = sceneWidth * zoom;
  const scaledSceneHeight = sceneHeight * zoom;
  const hasWalkingNpc = Object.values(npcs).some((npc) => npc.presence === "walking");

  useEffect(() => {
    const urls = new Set([
      ...Object.values(BUILDING_IMAGES),
      ...buildings.map((building) => building.customImageUrl).filter((url): url is string => Boolean(url)),
    ]);
    const images = Array.from(urls).map((url) => {
      const image = new Image();
      image.src = url;
      void image.decode?.().catch(() => undefined);
      return image;
    });
    return () => {
      images.forEach((image) => {
        image.src = "";
      });
    };
  }, [buildings]);

  const coverZoom = Math.max(
    viewportSize.width ? viewportSize.width / sceneWidth : 0,
    viewportSize.height ? viewportSize.height / sceneHeight : 0,
    0.5
  );
  const terrainEditing = Boolean(activeTerrain || activeCustomAsset?.kind === "terrain");
  const terrainAssetSubcells = TERRAIN_SUBDIV * 2;
  const selectedBuilding = buildings.find((building) => building.id === selectedId) ?? null;
  const selectedBuildingDefaultSize = selectedBuilding
    ? selectedBuilding.customImageUrl || selectedBuilding.customAssetId
      ? getCustomBuildingSize(selectedBuilding.customImageUrl)
      : buildingTypes[selectedBuilding.type]?.size ?? [1, 1]
    : null;
  function clampPan(next: { x: number; y: number }, nextZoom = zoom) {
    const overflowX = Math.max(0, (sceneWidth * nextZoom - viewportSize.width) / 2);
    const overflowY = Math.max(0, (sceneHeight * nextZoom - viewportSize.height) / 2);
    return {
      x: Math.max(-overflowX, Math.min(overflowX, next.x)),
      y: Math.max(-overflowY, Math.min(overflowY, next.y)),
    };
  }

  function snapTerrainSubcell(value: number) {
    return Math.floor(value / TERRAIN_SUBDIV) * TERRAIN_SUBDIV;
  }

  function terrainAreaStyle(x: number, y: number, width: number, height: number) {
    const top = isoToScreen(x / TERRAIN_SUBDIV, y / TERRAIN_SUBDIV);
    const right = isoToScreen((x + width) / TERRAIN_SUBDIV, y / TERRAIN_SUBDIV);
    const bottom = isoToScreen((x + width) / TERRAIN_SUBDIV, (y + height) / TERRAIN_SUBDIV);
    const left = isoToScreen(x / TERRAIN_SUBDIV, (y + height) / TERRAIN_SUBDIV);
    const minX = Math.min(top.x, right.x, bottom.x, left.x);
    const maxX = Math.max(top.x, right.x, bottom.x, left.x);
    const minY = Math.min(top.y, right.y, bottom.y, left.y);
    const maxY = Math.max(top.y, right.y, bottom.y, left.y);
    return {
      left: minX,
      top: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  function activeAssetSize(): { width: number; height: number } {
    if (!activeCustomAsset) return { width: 1, height: 1 };
    if (activeCustomAsset.kind === "building") return { width: 2, height: 2 };
    return activeCustomAsset.kind === "terrain"
      ? { width: terrainAssetSubcells, height: terrainAssetSubcells }
      : { width: 4, height: 4 };
  }

  function pointInPolygon(
    point: { x: number; y: number },
    polygon: Array<{ x: number; y: number }>
  ) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const pi = polygon[i];
      const pj = polygon[j];
      const intersects =
        pi.y > point.y !== pj.y > point.y &&
        point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function isPreviewInBuildableArea(
    x: number,
    y: number,
    size: { width: number; height: number },
    kind: AssetPreview["kind"]
  ) {
    if (!sceneTheme.buildablePolygon?.length) return true;
    const cols = kind === "building" ? grid.cols : grid.cols * 2;
    const rows = kind === "building" ? grid.rows : grid.rows * 2;
    return pointInPolygon(
      {
        x: (x + size.width / 2) / cols,
        y: (y + size.height / 2) / rows,
      },
      sceneTheme.buildablePolygon
    );
  }

  function terrainPointFromMouse(clientX: number, clientY: number) {
    const el = localRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const point = screenToIso((clientX - rect.left) / zoom, (clientY - rect.top) / zoom);
    return { x: Math.floor(point.x * 2), y: Math.floor(point.y * 2) };
  }

  function validTerrainPointFromMouse(clientX: number, clientY: number) {
    const point = terrainPointFromMouse(clientX, clientY);
    if (!point) return null;
    const maxX = grid.cols * TERRAIN_SUBDIV;
    const maxY = grid.rows * TERRAIN_SUBDIV;
    if (point.x < 0 || point.y < 0 || point.x >= maxX || point.y >= maxY) return null;
    return point;
  }

  function validGridPointFromMouse(clientX: number, clientY: number) {
    const el = localRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const point = screenToIso((clientX - rect.left) / zoom, (clientY - rect.top) / zoom);
    const x = Math.floor(point.x);
    const y = Math.floor(point.y);
    if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) return null;
    return { x, y };
  }

  function setActiveMapEditTool(nextTool: MapEditTool) {
    const active = mapEditTool === nextTool ? "none" : nextTool;
    setMapEditTool(active);
    setAssetPreview(null);
    setCopiedAssetPlacement(null);
    setCopiedAssetPreview(null);
    setSelectedQuickAssetId(null);
    setResizeMessage("");
    if (active === "resize-object") {
      setToolPanelPreferences((current) => ({ ...current, collapsed: false }));
    }
    if (active === "none") return;
    setActiveTerrain(null);
    setActiveDecoration(null);
    selectCustomAsset(null);
    if (active !== "resize-object") selectBuilding(null);
  }

  function getToolPanelLimits(panelWidth: number, _panelHeight: number) {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    const viewportRect = viewport.getBoundingClientRect();
    const dock = document.querySelector<HTMLElement>(".placement-dock");
    const dockRect = dock?.getBoundingClientRect();
    const dockTop = dockRect ? dockRect.top - viewportRect.top : viewport.clientHeight;
    const maxX = Math.max(BUILD_TOOL_PANEL_MARGIN, viewport.clientWidth - panelWidth - BUILD_TOOL_PANEL_MARGIN);
    const maxY = Math.max(BUILD_TOOL_PANEL_MARGIN, dockTop - 96 - BUILD_TOOL_PANEL_MARGIN);
    return {
      minX: BUILD_TOOL_PANEL_MARGIN,
      maxX,
      minY: BUILD_TOOL_PANEL_MARGIN,
      maxY,
      dockTop,
    };
  }

  function clampToolPanelPosition(x: number, y: number, panel = toolPanelRef.current) {
    if (!panel) return { x, y };
    const limits = getToolPanelLimits(panel.offsetWidth, panel.offsetHeight);
    if (!limits) return { x, y };
    const viewportWidth = viewportRef.current?.clientWidth ?? 0;
    const safeX = Math.max(limits.minX, Math.min(limits.maxX, x));
    const minimumY = safeX + panel.offsetWidth > viewportWidth - 180
      ? BUILD_TOOL_PANEL_DEFAULT_TOP
      : limits.minY;
    return {
      x: safeX,
      y: Math.max(minimumY, Math.min(limits.maxY, y)),
    };
  }

  function handleToolPanelPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !toolPanelRef.current || !viewportRef.current) return;
    const panelRect = toolPanelRef.current.getBoundingClientRect();
    toolPanelDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - panelRect.left,
      offsetY: event.clientY - panelRect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setToolPanelDragging(true);
    event.preventDefault();
    event.stopPropagation();
  }

  function handleToolPanelPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = toolPanelDragRef.current;
    const viewport = viewportRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !viewport) return;
    const viewportRect = viewport.getBoundingClientRect();
    const next = clampToolPanelPosition(
      event.clientX - viewportRect.left - drag.offsetX,
      event.clientY - viewportRect.top - drag.offsetY
    );
    setToolPanelPreferences((current) => ({ ...current, ...next }));
  }

  function stopToolPanelDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = toolPanelDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    toolPanelDragRef.current = null;
    setToolPanelDragging(false);
  }

  function handleBuildPreviewToggle() {
    if (!buildPreviewMode) {
      setMapEditTool("none");
      setBuildingsHidden(false);
      setSelectedQuickAssetId(null);
      setCopiedAssetPlacement(null);
      setCopiedAssetPreview(null);
      setAssetPreview(null);
      setResizeMessage("");
      selectBuilding(null);
      setActiveTerrain(null);
      setActiveDecoration(null);
      selectCustomAsset(null);
    }
    toggleBuildPreviewMode();
  }

  function applyBuildingSize(buildingId: string, width: number, height: number) {
    const ok = resizeBuilding(buildingId, [width, height]);
    setResizeMessage(ok ? "尺寸已应用到草稿" : "这个尺寸会越界或产生碰撞");
  }

  function stopQuickControlEvent(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  function resizeQuickAsset(assetId: string, kind: "terrain" | "decoration", width: number, height: number, delta: number) {
    const minimumSize = kind === "terrain" ? 2 : 1;
    const nextWidth = Math.max(minimumSize, width + delta);
    const nextHeight = Math.max(minimumSize, height + delta);
    const ok = resizeCustomAsset(assetId, nextWidth, nextHeight);
    setSelectedQuickAssetId(assetId);
    setResizeMessage(ok ? "尺寸已应用到草稿" : "这个尺寸会越界或产生碰撞");
    selectBuilding(null);
  }

  function copyQuickAsset(asset: CopiedAssetPlacement) {
    setCopiedAssetPlacement(asset);
    setCopiedAssetPreview(null);
    setSelectedQuickAssetId(null);
    setMapEditTool("none");
    setActiveTerrain(null);
    setActiveDecoration(null);
    selectCustomAsset(null);
    selectBuilding(null);
  }

  function deleteQuickAsset(assetId: string) {
    removeCustomAsset(assetId);
    setSelectedQuickAssetId((current) => current === assetId ? null : current);
    setResizeMessage("");
  }

  function resetResizeTarget() {
    if (!selectedBuilding || !selectedBuildingDefaultSize) return;
    applyBuildingSize(selectedBuilding.id, selectedBuildingDefaultSize[0], selectedBuildingDefaultSize[1]);
  }

  function updateActiveAssetPreview(clientX: number, clientY: number) {
    if (!activeCustomAsset) {
      setAssetPreview(null);
      return;
    }
    const el = localRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const size = activeAssetSize();
    const maxX =
      activeCustomAsset.kind === "building" ? grid.cols - size.width : grid.cols * 2 - size.width;
    const maxY =
      activeCustomAsset.kind === "building" ? grid.rows - size.height : grid.rows * 2 - size.height;
    const isoPoint = screenToIso((clientX - rect.left) / zoom, (clientY - rect.top) / zoom);
    const coordinateScale = activeCustomAsset.kind === "building" ? 1 : 2;
    const rawX = Math.floor(isoPoint.x * coordinateScale);
    const rawY = Math.floor(isoPoint.y * coordinateScale);
    const x = Math.max(0, Math.min(activeCustomAsset.kind === "terrain" ? snapTerrainSubcell(rawX) : rawX, maxX));
    const y = Math.max(0, Math.min(activeCustomAsset.kind === "terrain" ? snapTerrainSubcell(rawY) : rawY, maxY));
    const kind = activeCustomAsset.kind;
    const valid = isPreviewInBuildableArea(x, y, size, kind);
    setAssetPreview({
      x,
      y,
      width: size.width,
      height: size.height,
      kind,
      label:
        kind === "terrain"
          ? valid
            ? "2×2 可走"
            : "超出可编辑区"
          : kind === "decoration"
          ? valid
            ? "1×1 阻挡"
            : "超出可编辑区"
          : valid
          ? "2×2 建筑"
          : "超出可编辑区",
      valid,
    });
  }

  useEffect(() => {
    if (!hasWalkingNpc) return;
    const timer = window.setInterval(() => stepWalkingNpcs(), 2200);
    return () => window.clearInterval(timer);
  }, [hasWalkingNpc, stepWalkingNpcs]);

  useEffect(() => {
    if (!activeCustomAssetId && !activeTerrain && !activeDecoration) return;
    setCopiedAssetPlacement(null);
    setCopiedAssetPreview(null);
    setSelectedQuickAssetId(null);
  }, [activeCustomAssetId, activeTerrain, activeDecoration]);

  useEffect(() => {
    if (!buildEditing) {
      setCopiedAssetPlacement(null);
      setCopiedAssetPreview(null);
      setSelectedQuickAssetId(null);
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setCopiedAssetPlacement(null);
      setCopiedAssetPreview(null);
      setSelectedQuickAssetId(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [buildEditing]);

  useEffect(() => {
    if (!buildEditing) {
      if (mapEditTool !== "none") setMapEditTool("none");
      setBuildingsHidden(false);
    }
  }, [buildEditing, mapEditTool]);

  useEffect(() => {
    if (panMode && mapEditTool !== "none") setMapEditTool("none");
  }, [panMode, mapEditTool]);

  useEffect(() => {
    if (selectedId) setSelectedQuickAssetId(null);
  }, [selectedId]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => {
      setViewportSize({ width: viewport.clientWidth, height: viewport.clientHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!buildMode) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateDockTop = () => {
      const viewportRect = viewport.getBoundingClientRect();
      const dock = document.querySelector<HTMLElement>(".placement-dock");
      setToolPanelDockTop(dock ? dock.getBoundingClientRect().top - viewportRect.top : viewport.clientHeight);
    };
    const frame = window.requestAnimationFrame(updateDockTop);
    const dock = document.querySelector<HTMLElement>(".placement-dock");
    const observer = new ResizeObserver(updateDockTop);
    observer.observe(viewport);
    if (dock) observer.observe(dock);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [buildMode]);

  useEffect(() => {
    if (!buildMode) return;
    const frame = window.requestAnimationFrame(() => {
      const panel = toolPanelRef.current;
      if (!panel) return;
      const defaultX = Math.max(
        BUILD_TOOL_PANEL_MARGIN,
        viewportSize.width - panel.offsetWidth - 22
      );
      const next = clampToolPanelPosition(
        toolPanelPreferences.x ?? defaultX,
        toolPanelPreferences.y,
        panel
      );
      setToolPanelPreferences((current) =>
        current.x === next.x && current.y === next.y ? current : { ...current, ...next }
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [buildMode, buildPreviewMode, toolPanelPreferences.collapsed, toolPanelDockTop, viewportSize.height, viewportSize.width]);

  useEffect(() => {
    if (toolPanelPreferences.x === null) return;
    try {
      window.localStorage.setItem(BUILD_TOOL_PANEL_STORAGE_KEY, JSON.stringify(toolPanelPreferences));
    } catch {
      // UI preferences are optional when storage is unavailable.
    }
  }, [toolPanelPreferences]);

  useEffect(() => {
    if (!toolPanelDragging) return;
    const finishDrag = () => {
      toolPanelDragRef.current = null;
      setToolPanelDragging(false);
    };
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    window.addEventListener("mouseup", finishDrag);
    window.addEventListener("blur", finishDrag);
    return () => {
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
      window.removeEventListener("mouseup", finishDrag);
      window.removeEventListener("blur", finishDrag);
    };
  }, [toolPanelDragging]);

  useEffect(() => {
    setZoom((current) => Math.max(current, coverZoom));
  }, [coverZoom]);

  useEffect(() => {
    setPan((current) => clampPan(current));
  }, [zoom, viewportSize.width, viewportSize.height]);

  function updateZoom(nextZoom: number) {
    const next = Math.max(coverZoom, Math.min(2.25, nextZoom));
    setZoom(next);
    setPan((current) => clampPan(current, next));
  }

  function paintAt(clientX: number, clientY: number) {
    const el = localRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const point = screenToIso((clientX - rect.left) / zoom, (clientY - rect.top) / zoom);
    const rawX = Math.floor(point.x * TERRAIN_SUBDIV);
    const rawY = Math.floor(point.y * TERRAIN_SUBDIV);
    const x = snapTerrainSubcell(rawX);
    const y = snapTerrainSubcell(rawY);
    paintGround(x, y);
  }

  function placeDecorationAt(clientX: number, clientY: number) {
    const el = localRef.current;
    if (!el || !activeDecoration) return;
    const rect = el.getBoundingClientRect();
    const point = screenToIso((clientX - rect.left) / zoom, (clientY - rect.top) / zoom);
    const x = Math.floor(point.x * 2);
    const y = Math.floor(point.y * 2);
    placeDecoration(activeDecoration, x, y);
  }

  function placeCustomAssetAt(clientX: number, clientY: number) {
    const el = localRef.current;
    if (!el || !activeCustomAssetId) return;
    const rect = el.getBoundingClientRect();
    const point = screenToIso((clientX - rect.left) / zoom, (clientY - rect.top) / zoom);
    const coordinateScale = activeCustomAsset?.kind === "building" ? 1 : 2;
    const rawX = Math.floor(point.x * coordinateScale);
    const rawY = Math.floor(point.y * coordinateScale);
    const x = activeCustomAsset?.kind === "terrain" ? snapTerrainSubcell(rawX) : rawX;
    const y = activeCustomAsset?.kind === "terrain" ? snapTerrainSubcell(rawY) : rawY;
    placeCustomAsset(activeCustomAssetId, x, y);
  }

  function copiedAssetPreviewFromMouse(clientX: number, clientY: number, copied = copiedAssetPlacement) {
    if (!copied) return null;
    const point = terrainPointFromMouse(clientX, clientY);
    if (!point) return null;
    const maxX = grid.cols * TERRAIN_SUBDIV - copied.width;
    const maxY = grid.rows * TERRAIN_SUBDIV - copied.height;
    const rawX = copied.kind === "terrain" ? snapTerrainSubcell(point.x) : point.x;
    const rawY = copied.kind === "terrain" ? snapTerrainSubcell(point.y) : point.y;
    const x = Math.max(0, Math.min(rawX, maxX));
    const y = Math.max(0, Math.min(rawY, maxY));
    return {
      x,
      y,
      width: copied.width,
      height: copied.height,
      kind: copied.kind,
      label: `${copied.width}×${copied.height} 复制`,
      valid: isPreviewInBuildableArea(x, y, copied, copied.kind),
    };
  }

  function placeCopiedAssetAt(clientX: number, clientY: number) {
    if (!copiedAssetPlacement) return;
    const preview = copiedAssetPreviewFromMouse(clientX, clientY);
    if (!preview || !preview.valid) return;
    const ok = placeCustomAssetInstance(
      copiedAssetPlacement.assetId,
      preview.x,
      preview.y,
      {
        width: copiedAssetPlacement.width,
        height: copiedAssetPlacement.height,
      }
    );
    if (ok) {
      setCopiedAssetPlacement(null);
      setCopiedAssetPreview(null);
    }
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (!buildEditing) return;
    if (mapEditTool === "erase-terrain") {
      const point = validTerrainPointFromMouse(e.clientX, e.clientY);
      if (!point) return;
      isPaintingRef.current = true;
      mapEditDirtyRef.current = true;
      eraseTerrainAt(point.x, point.y);
      return;
    }
    if (mapEditTool === "block-walk-area") {
      const point = validGridPointFromMouse(e.clientX, e.clientY);
      if (!point) return;
      isPaintingRef.current = true;
      mapEditDirtyRef.current = true;
      blockedDragModeRef.current = blockedWalkCells[`${point.x},${point.y}`] ? "unblock" : "block";
      toggleBlockedWalkCell(point.x, point.y, blockedDragModeRef.current);
      return;
    }
    if (copiedAssetPlacement) {
      placeCopiedAssetAt(e.clientX, e.clientY);
      return;
    }
    if (activeCustomAssetId) {
      if (activeCustomAsset?.kind === "terrain") isPaintingRef.current = true;
      placeCustomAssetAt(e.clientX, e.clientY);
      return;
    }
    if (activeDecoration) {
      placeDecorationAt(e.clientX, e.clientY);
      return;
    }
    if (!activeTerrain) {
      selectBuilding(null);
      setSelectedQuickAssetId(null);
      return;
    }
    isPaintingRef.current = true;
    paintAt(e.clientX, e.clientY);
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!buildEditing) return;
    const moving = movingAssetRef.current;
    if (moving) {
      const point = terrainPointFromMouse(e.clientX, e.clientY);
      if (point) moveCustomAsset(moving.id, point.x - moving.dx, point.y - moving.dy);
      return;
    }
    if (mapEditTool === "erase-terrain") {
      if (!isPaintingRef.current) return;
      const point = validTerrainPointFromMouse(e.clientX, e.clientY);
      if (!point) return;
      mapEditDirtyRef.current = true;
      eraseTerrainAt(point.x, point.y);
      return;
    }
    if (mapEditTool === "block-walk-area") {
      if (!isPaintingRef.current) return;
      const point = validGridPointFromMouse(e.clientX, e.clientY);
      if (!point) return;
      mapEditDirtyRef.current = true;
      toggleBlockedWalkCell(point.x, point.y, blockedDragModeRef.current);
      return;
    }
    if (copiedAssetPlacement) {
      setCopiedAssetPreview(copiedAssetPreviewFromMouse(e.clientX, e.clientY));
      return;
    }
    if (activeCustomAssetId) {
      updateActiveAssetPreview(e.clientX, e.clientY);
      if (activeCustomAsset?.kind === "terrain" && isPaintingRef.current) {
        placeCustomAssetAt(e.clientX, e.clientY);
      }
      return;
    }
    if (activeDecoration) return;
    if (!activeTerrain || !isPaintingRef.current) return;
    paintAt(e.clientX, e.clientY);
  }

  function stopPainting() {
    if (mapEditDirtyRef.current) {
      mapEditDirtyRef.current = false;
    }
    isPaintingRef.current = false;
    movingAssetRef.current = null;
  }

  function handleViewportMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!panMode || e.button !== 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: pan.x,
      scrollTop: pan.y,
    };
    setIsPanning(true);
    e.preventDefault();
  }

  function handleViewportMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const start = panStartRef.current;
    if (!start) return;
    setPan(clampPan({ x: start.scrollLeft + (e.clientX - start.x), y: start.scrollTop + (e.clientY - start.y) }));
  }

  function stopPanning() {
    panStartRef.current = null;
    setIsPanning(false);
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      updateZoom(zoom + (e.deltaY < 0 ? 0.12 : -0.12));
      return;
    }
    setPan((current) => clampPan({ x: current.x - e.deltaX, y: current.y - e.deltaY }));
  }

  const selectedBuildingSize = selectedBuilding ? getPlacedBuildingSize(selectedBuilding, buildingTypes) : null;
  const canResizeSelection = mapEditTool === "resize-object" && Boolean(selectedBuilding && selectedBuildingSize && selectedBuildingDefaultSize);
  const selectedBuildingScale = selectedBuildingSize && selectedBuildingDefaultSize
    ? Math.round((Math.max(...selectedBuildingSize) / Math.max(...selectedBuildingDefaultSize)) * 100)
    : 100;

  function changeBuildingScale(delta: -1 | 1) {
    if (!selectedBuilding || !selectedBuildingSize || !selectedBuildingDefaultSize) return;
    const defaultLongestEdge = Math.max(...selectedBuildingDefaultSize);
    const nextLongestEdge = Math.max(1, Math.max(...selectedBuildingSize) + delta);
    const scale = nextLongestEdge / defaultLongestEdge;
    const nextWidth = Math.max(1, Math.round(selectedBuildingDefaultSize[0] * scale));
    const nextHeight = Math.max(1, Math.round(selectedBuildingDefaultSize[1] * scale));
    applyBuildingSize(selectedBuilding.id, nextWidth, nextHeight);
  }

  return (
    <div
      ref={viewportRef}
      onMouseDown={handleViewportMouseDown}
      onMouseMove={handleViewportMouseMove}
      onWheel={handleWheel}
      onMouseUp={() => {
        stopPainting();
        stopPanning();
      }}
      onMouseLeave={() => {
        stopPainting();
        stopPanning();
        setAssetPreview(null);
      }}
      style={{
        position: "relative",
        flex: 1,
        overflow: "hidden",
        background: sceneTheme.background,
        padding: 0,
        overscrollBehavior: "none",
        cursor: panMode ? (isPanning ? "grabbing" : "grab") : undefined,
        userSelect: isPanning ? "none" : undefined,
      }}
    >
      <div style={viewControlsStyle} onMouseDown={(e) => e.stopPropagation()}>
        <button
          onClick={() => setPanMode((value) => !value)}
          title="Pan view"
          style={{
            ...viewButtonStyle,
            background: panMode ? "#7fbf7f" : "var(--ac-surface-raised)",
            color: panMode ? "#0e1a0e" : "var(--ac-text)",
          }}
        >
          ✋
        </button>
        <button onClick={() => updateZoom(zoom - 0.15)} title="Zoom out" style={viewButtonStyle}>
          -
        </button>
        <span style={{ width: 40, textAlign: "center", fontSize: 11, color: "var(--ac-text-soft)" }}>
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={() => updateZoom(zoom + 0.15)} title="Zoom in" style={viewButtonStyle}>
          +
        </button>
        <button onClick={() => updateZoom(coverZoom)} title="Reset zoom" style={viewButtonStyle}>
          1x
        </button>
      </div>

      {buildMode && (
        <div
          ref={toolPanelRef}
          className={`map-edit-tools ${toolPanelPreferences.collapsed ? "is-collapsed" : ""} ${toolPanelDragging ? "is-dragging" : ""} ${buildPreviewMode ? "is-preview" : ""}`}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label="地图编辑工具"
          style={{
            left: toolPanelPreferences.x ?? undefined,
            top: toolPanelPreferences.y,
            maxHeight: Math.max(
              96,
              (toolPanelDockTop || viewportSize.height) - toolPanelPreferences.y - BUILD_TOOL_PANEL_MARGIN
            ),
          }}
        >
          <div className="map-edit-tools__header">
            <div
              className="map-edit-tools__drag-handle"
              onPointerDown={handleToolPanelPointerDown}
              onPointerMove={handleToolPanelPointerMove}
              onPointerUp={stopToolPanelDrag}
              onPointerCancel={stopToolPanelDrag}
              title="拖动工具面板"
            >
              <span aria-hidden="true">⠿</span>
              <strong>Build 工具</strong>
            </div>
            <button
              className={`map-edit-tools__preview ${buildPreviewMode ? "is-active" : ""}`}
              onClick={handleBuildPreviewToggle}
              aria-label={buildPreviewMode ? "退出预览模式" : "进入预览模式"}
              aria-pressed={buildPreviewMode}
              title={buildPreviewMode ? "退出预览，返回编辑模式" : "预览最终城市画面"}
            >
              👁
            </button>
            <button
              className="map-edit-tools__collapse"
              onClick={() => setToolPanelPreferences((current) => ({ ...current, collapsed: !current.collapsed }))}
              aria-label={toolPanelPreferences.collapsed ? "展开地图编辑工具" : "收起地图编辑工具"}
              title={toolPanelPreferences.collapsed ? "展开工具面板" : "收起工具面板"}
            >
              {toolPanelPreferences.collapsed ? "›" : "‹"}
            </button>
          </div>
          <div className="map-edit-tools__body" aria-hidden={buildPreviewMode}>
          <button
            className={`map-edit-tools__primary ${saveStatus === "saved" ? "is-saved" : ""} ${saveStatus === "error" ? "is-error" : ""}`}
            disabled={saveStatus === "saving"}
            onClick={() => {
              void saveEditingLayoutScheme().catch(() => {
                showLaunchToast("保存失败，请稍后重试");
              });
            }}
            title="保存当前方案"
          >
            <span className="map-edit-tools__icon">{saveStatus === "error" ? "!" : "✓"}</span>
            <span className="map-edit-tools__label">
              {saveStatus === "saving"
                ? "正在保存..."
                : saveStatus === "saved"
                ? "保存成功"
                : saveStatus === "error"
                ? "保存失败"
                : "保存方案"}
            </span>
          </button>
          <button
            className={buildingsHidden ? "is-active" : ""}
            onClick={() => setBuildingsHidden((hidden) => !hidden)}
            title={buildingsHidden ? "重新显示所有建筑" : "临时隐藏所有建筑，方便铺设地形"}
          >
            <span className="map-edit-tools__icon">{buildingsHidden ? "◉" : "◌"}</span>
            <span className="map-edit-tools__label">{buildingsHidden ? "显示所有建筑" : "隐藏所有建筑"}</span>
          </button>
          <button
            className="map-edit-tools__danger"
            onClick={() => {
              clearCurrentLayoutDraft();
              setMapEditTool("none");
              setSelectedQuickAssetId(null);
              setResizeMessage("");
              showLaunchToast("已清空当前草稿，保存方案后生效");
            }}
            title="清空当前草稿中的建筑、地砖、装饰和禁行区"
          >
            <span className="map-edit-tools__icon">⌧</span>
            <span className="map-edit-tools__label">清空全部</span>
          </button>
          <button
            className={mapEditTool === "erase-terrain" ? "is-active" : ""}
            onClick={() => setActiveMapEditTool("erase-terrain")}
            title="按住鼠标拖动，清理经过区域的地砖"
          >
            <span className="map-edit-tools__icon">⌫</span>
            <span className="map-edit-tools__label">清理地砖</span>
          </button>
          <button
            onClick={() => {
              clearAllTerrainTiles();
              setActiveTerrain(null);
              setActiveDecoration(null);
              selectCustomAsset(null);
              selectBuilding(null);
              setMapEditTool("none");
              showLaunchToast("已清空地砖，保存方案后生效");
            }}
            title="清空地图上的所有地砖"
          >
            <span className="map-edit-tools__icon">⌧</span>
            <span className="map-edit-tools__label">清空地砖</span>
          </button>
          <button
            className={mapEditTool === "block-walk-area" ? "is-active" : ""}
            onClick={() => setActiveMapEditTool("block-walk-area")}
            title="拖选网格，橙色区域为 Agent 禁行区"
          >
            <span className="map-edit-tools__icon">▧</span>
            <span className="map-edit-tools__label">规划行走区域</span>
          </button>
          <button
            className={mapEditTool === "resize-object" ? "is-active" : ""}
            onClick={() => setActiveMapEditTool("resize-object")}
            title="选择建筑后按原始比例放大或缩小"
          >
            <span className="map-edit-tools__icon">↔</span>
            <span className="map-edit-tools__label">调节大小</span>
          </button>
          {mapEditTool === "resize-object" && (
            <div className="map-resize-panel">
              {canResizeSelection && selectedBuilding && selectedBuildingSize ? (
                <>
                  <strong>{selectedBuilding.name}</strong>
                  <small>建筑等比例占格 · {selectedBuildingSize[0]} × {selectedBuildingSize[1]}</small>
                  <label>
                    等比例尺寸
                    <div className="map-resize-panel__scale">
                      <button onClick={() => changeBuildingScale(-1)} aria-label="缩小建筑">-</button>
                      <output>{selectedBuildingScale}%</output>
                      <button onClick={() => changeBuildingScale(1)} aria-label="放大建筑">+</button>
                    </div>
                  </label>
                  <button className="map-resize-panel__reset" onClick={resetResizeTarget}>重置默认</button>
                  {resizeMessage && <em>{resizeMessage}</em>}
                </>
              ) : (
                <p>先点击一个建筑，再使用减号或加号等比例缩放。</p>
              )}
            </div>
          )}
          </div>
        </div>
      )}

      <div
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          inset: 0,
          zIndex: 1,
          boxSizing: "border-box",
          padding: 0,
        }}
      >
        <div
          style={{
            width: scaledSceneWidth,
            height: scaledSceneHeight,
            position: "absolute",
            left: `calc(50% + ${pan.x}px)`,
            top: `calc(50% + ${pan.y}px)`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <div
            className={`agent-city-scene agent-city-scene-${sceneTheme.id}`}
            style={{
              width: sceneWidth,
              height: sceneHeight,
              background: sceneTheme.background,
              transform: `translateZ(0) scale(${zoom})`,
              transformOrigin: "top left",
              pointerEvents: panMode ? "none" : "auto",
              backfaceVisibility: "hidden",
              willChange: "transform",
            }}
          >
            <div
            className={`agent-city-buildable-shell ${buildEditing ? "agent-city-buildable-shell-build-mode" : ""}`}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: mapWidth,
                height: mapHeight,
              }}
            >
              <div
                ref={mergeRefs(ref, setNodeRef, localRef)}
                id="city-grid-container"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={stopPainting}
                onMouseLeave={stopPainting}
                style={{
                  position: "relative",
                  width: mapWidth,
                  height: mapHeight,
                  zIndex: 2,
                  borderRadius: 10,
                  overflow: "visible",
                  cursor: mapEditTool === "erase-terrain"
                    ? "cell"
                    : mapEditTool === "block-walk-area"
                    ? "crosshair"
                    : mapEditTool === "resize-object"
                    ? "pointer"
                    : activeCustomAssetId
                    ? activeCustomAsset?.kind === "terrain" ? "crosshair" : "copy"
                    : activeDecoration
                    ? "copy"
                    : activeTerrain
                    ? "crosshair"
                    : undefined,
                }}
              >
                {buildEditing && (
                  <svg className="isometric-placement-grid" width={mapWidth} height={mapHeight} viewBox={`0 0 ${mapWidth} ${mapHeight}`} aria-hidden="true">
                    {Array.from({ length: grid.cols + 1 }, (_, x) => {
                      const a = isoToScreen(x, 0); const b = isoToScreen(x, grid.rows);
                      return <line key={`iso-x-${x}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
                    })}
                    {Array.from({ length: grid.rows + 1 }, (_, y) => {
                      const a = isoToScreen(0, y); const b = isoToScreen(grid.cols, y);
                      return <line key={`iso-y-${y}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
                    })}
                  </svg>
                )}
                {buildEditing && Object.entries(blockedWalkCells).map(([key]) => {
                  const [x, y] = key.split(",").map(Number);
                  const area = terrainAreaStyle(
                    x * TERRAIN_SUBDIV - TERRAIN_SUBDIV / 2,
                    y * TERRAIN_SUBDIV - TERRAIN_SUBDIV / 2,
                    TERRAIN_SUBDIV * 2,
                    TERRAIN_SUBDIV * 2
                  );
                  return (
                    <div
                      key={key}
                      className="blocked-walk-cell"
                      style={{
                        left: area.left,
                        top: area.top,
                        width: area.width,
                        height: area.height,
                      }}
                    />
                  );
                })}
                {Object.entries(ground).map(([key, terrain]) => {
                  const [x, y] = key.split(",").map(Number);
                  const area = terrainAreaStyle(x, y, terrainAssetSubcells, terrainAssetSubcells);
                  return (
                    <img
                      key={key}
                      src={TERRAIN_TILES[terrain]}
                      alt={terrain}
                      draggable={false}
                      style={{
                        position: "absolute",
                        left: area.left,
                        top: area.top,
                        width: area.width,
                        height: area.height,
                        objectFit: "cover",
                        clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)",
                        pointerEvents: "none",
                        zIndex: 0,
                      }}
                    />
                  );
                })}

                {decorations.map((d) => {
                  const point = isoToScreen(d.x / 2, d.y / 2);
                  return <img
                      key={d.id}
                      src={DECORATION_IMAGES[d.type]}
                      alt=""
                      draggable={false}
                      style={{
                        position: "absolute",
                        left: point.x - 30,
                        top: point.y - 54,
                        width: 60,
                        height: 60,
                        objectFit: "contain",
                        objectPosition: "center bottom",
                        pointerEvents: "none",
                        zIndex: 100 + Math.round((d.x / 2 + d.y / 2 + 2) * CELL_SIZE),
                        filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.35))",
                      }}
                    />;
                })}

                {placedCustomAssets.map((asset) => {
                  const isTerrainAsset = asset.kind === "terrain";
                  const isModularRoadAsset = isRoadAssetUrl(asset.url);
                  const terrainArea = isTerrainAsset ? terrainAreaStyle(asset.x, asset.y, asset.width, asset.height) : null;
                  const point = isTerrainAsset ? null : isoToScreen(asset.x / 2, asset.y / 2);
                  const visualWidth = terrainArea ? terrainArea.width : Math.max(68, asset.width * 18);
                  const visualHeight = terrainArea ? terrainArea.height : Math.max(68, asset.height * 18);
                  const isQuickAsset = asset.kind === "terrain" || asset.kind === "decoration";
                  const shouldShowQuickControls = buildEditing && isQuickAsset && selectedQuickAssetId === asset.id;
                  const quickControlLeft = terrainArea
                    ? terrainArea.left + terrainArea.width - 2
                    : point!.x + visualWidth / 2 - 2;
                  const quickControlTop = terrainArea
                    ? terrainArea.top + terrainArea.height / 2
                    : point!.y - visualHeight / 2;
                  const assetKindLabel = asset.kind === "terrain" ? "地砖" : "装饰";
                  return <Fragment key={asset.id}>
                  <div
                    title={asset.name}
                    onMouseDown={(event) => {
                      if (!buildEditing) return;
                      event.stopPropagation();
                      setSelectedQuickAssetId(asset.id);
                      selectBuilding(null);
                      setResizeMessage("");
                      if (mapEditTool === "resize-object") setMapEditTool("none");
                      const point = terrainPointFromMouse(event.clientX, event.clientY);
                      movingAssetRef.current = {
                        id: asset.id,
                        dx: point ? point.x - asset.x : 0,
                        dy: point ? point.y - asset.y : 0,
                      };
                    }}
                    style={{
                      position: "absolute",
                      left: terrainArea ? terrainArea.left : point!.x - visualWidth / 2,
                      top: terrainArea ? terrainArea.top : point!.y - visualHeight,
                      width: visualWidth,
                      height: visualHeight,
                      pointerEvents: terrainEditing ? "none" : buildEditing ? "auto" : "none",
                      zIndex: asset.kind === "terrain" ? 0 : 100 + Math.round((asset.x / 2 + asset.y / 2 + asset.height / 2) * CELL_SIZE),
                      cursor: buildEditing ? "move" : "default",
                      border:
                        asset.kind === "terrain"
                          ? "none"
                          : selectedQuickAssetId === asset.id
                          ? "2px solid rgba(96,165,250,0.95)"
                          : buildEditing && asset.kind !== "building"
                          ? "1px dashed rgba(248,113,113,0.34)"
                          : "none",
                      borderRadius: asset.kind === "terrain" ? 0 : 8,
                      overflow: "visible",
                    }}
                  >
                    <img
                      src={asset.url}
                      alt={asset.name}
                      draggable={false}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: asset.kind === "terrain" && !isModularRoadAsset ? "cover" : "contain",
                        objectPosition: "center bottom",
                        imageRendering: asset.url.includes("/tileable/") ? "auto" : undefined,
                        clipPath: isTerrainAsset && !isModularRoadAsset ? "polygon(50% 0,100% 50%,50% 100%,0 50%)" : undefined,
                        filter:
                          asset.kind === "terrain"
                            ? undefined
                            : "drop-shadow(-6px 8px 6px rgba(0,0,0,0.30))",
                      }}
                    />
                    {buildEditing && asset.kind === "terrain" && (
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 100 50"
                        preserveAspectRatio="none"
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
                      >
                        <polygon
                          points="50,1 99,25 50,49 1,25"
                          fill="none"
                          stroke={selectedQuickAssetId === asset.id ? "rgba(96,165,250,0.98)" : "rgba(250,204,21,0.34)"}
                          strokeWidth={selectedQuickAssetId === asset.id ? 2 : 1}
                          strokeDasharray="5 4"
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    )}
                  </div>
                  {shouldShowQuickControls && (
                    <div
                      aria-label={`${asset.name} 快捷编辑`}
                      style={{
                        ...terrainQuickControlsStyle,
                        left: quickControlLeft,
                        top: quickControlTop,
                      }}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      <button
                        type="button"
                        aria-label={`复制${assetKindLabel}`}
                        title={`复制${assetKindLabel}`}
                        style={terrainQuickButtonStyle}
                        onMouseDown={stopQuickControlEvent}
                        onClick={(event) => {
                          stopQuickControlEvent(event);
                          copyQuickAsset({
                            assetId: asset.assetId,
                            kind: asset.kind as "terrain" | "decoration",
                            name: asset.name,
                            url: asset.url,
                            width: asset.width,
                            height: asset.height,
                          });
                        }}
                      >
                        ⧉
                      </button>
                      <button
                        type="button"
                        aria-label={`放大${assetKindLabel}`}
                        title={`放大${assetKindLabel}`}
                        style={terrainQuickButtonStyle}
                        onMouseDown={stopQuickControlEvent}
                        onClick={(event) => {
                          stopQuickControlEvent(event);
                          resizeQuickAsset(asset.id, asset.kind as "terrain" | "decoration", asset.width, asset.height, 1);
                        }}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        aria-label={`缩小${assetKindLabel}`}
                        title={`缩小${assetKindLabel}`}
                        style={terrainQuickButtonStyle}
                        onMouseDown={stopQuickControlEvent}
                        onClick={(event) => {
                          stopQuickControlEvent(event);
                          resizeQuickAsset(asset.id, asset.kind as "terrain" | "decoration", asset.width, asset.height, -1);
                        }}
                      >
                        -
                      </button>
                      <button
                        type="button"
                        aria-label={`删除${assetKindLabel}`}
                        title={`删除${assetKindLabel}`}
                        style={terrainQuickDeleteButtonStyle}
                        onMouseDown={stopQuickControlEvent}
                        onClick={(event) => {
                          stopQuickControlEvent(event);
                          deleteQuickAsset(asset.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )}
                  </Fragment>;
                })}

                {buildEditing && assetPreview && activeCustomAsset && (
                  <div
                    data-asset-preview-kind={assetPreview.kind}
                    style={{
                      position: "absolute",
                      ...(assetPreview.kind === "terrain"
                        ? terrainAreaStyle(assetPreview.x, assetPreview.y, assetPreview.width, assetPreview.height)
                        : {
                            left:
                              isoToScreen(
                                assetPreview.kind === "building" ? assetPreview.x : assetPreview.x / 2,
                                assetPreview.kind === "building" ? assetPreview.y : assetPreview.y / 2
                              ).x - (assetPreview.kind === "decoration" ? 40 : 0),
                            top:
                              isoToScreen(
                                assetPreview.kind === "building" ? assetPreview.x : assetPreview.x / 2,
                                assetPreview.kind === "building" ? assetPreview.y : assetPreview.y / 2
                              ).y - (assetPreview.kind === "decoration" ? 76 : 0),
                            width: assetPreview.kind === "decoration" ? 80 : assetPreview.width * CELL_SIZE,
                            height: assetPreview.kind === "decoration" ? 80 : assetPreview.height * CELL_SIZE,
                          }),
                      zIndex: 9999,
                      pointerEvents: "none",
                      border:
                        assetPreview.kind === "terrain"
                          ? "none"
                          : !assetPreview.valid
                          ? "2px dashed rgba(248,113,113,0.98)"
                          : assetPreview.kind === "decoration"
                          ? "2px dashed rgba(248,113,113,0.95)"
                          : assetPreview.kind === "building"
                          ? "2px dashed rgba(96,165,250,0.95)"
                          : "2px dashed rgba(250,204,21,0.95)",
                      backgroundColor:
                        assetPreview.kind === "terrain"
                          ? "transparent"
                          : !assetPreview.valid
                          ? "rgba(248,113,113,0.22)"
                          : assetPreview.kind === "decoration"
                          ? "rgba(248,113,113,0.18)"
                          : assetPreview.kind === "building"
                          ? "rgba(96,165,250,0.16)"
                          : "rgba(250,204,21,0.18)",
                      borderRadius: assetPreview.kind === "terrain" ? 0 : 8,
                      clipPath:
                        assetPreview.kind === "terrain" && !isRoadAssetUrl(activeCustomAsset.url)
                          ? "polygon(50% 0,100% 50%,50% 100%,0 50%)"
                          : undefined,
                      boxShadow: assetPreview.valid
                        ? assetPreview.kind === "terrain" ? "none" : "0 0 0 2px var(--ac-glass), 0 0 22px rgba(250,204,21,0.24)"
                        : assetPreview.kind === "terrain" ? "none" : "0 0 0 2px var(--ac-glass), 0 0 22px rgba(248,113,113,0.28)",
                    }}
                  >
                    <img
                      src={activeCustomAsset.url}
                      alt=""
                      draggable={false}
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit:
                          assetPreview.kind === "terrain" && !isRoadAssetUrl(activeCustomAsset.url)
                            ? "cover"
                            : "contain",
                        objectPosition: "center bottom",
                      }}
                    />
                    {assetPreview.kind === "terrain" && (
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 100 50"
                        preserveAspectRatio="none"
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
                      >
                        <polygon
                          points="50,1 99,25 50,49 1,25"
                          fill={assetPreview.valid ? "rgba(250,204,21,0.08)" : "rgba(248,113,113,0.12)"}
                          stroke={assetPreview.valid ? "rgba(250,204,21,0.98)" : "rgba(248,113,113,0.98)"}
                          strokeWidth="2"
                          strokeDasharray="6 4"
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    )}
                    <span
                      style={{
                        position: "absolute",
                        left: 4,
                        top: -24,
                        borderRadius: 999,
                        background: "var(--ac-glass)",
                        border: assetPreview.valid
                          ? "1px solid var(--ac-border)"
                          : "1px solid rgba(248,113,113,0.48)",
                        color: "var(--ac-text)",
                        padding: "2px 7px",
                        fontSize: 10,
                        fontWeight: 950,
                        whiteSpace: "nowrap",
                        zIndex: 1,
                      }}
                    >
                      {assetPreview.label}
                    </span>
                  </div>
                )}

                {buildEditing && copiedAssetPreview && copiedAssetPlacement && (
                  <div
                    data-asset-preview-kind={`${copiedAssetPlacement.kind}-copy`}
                    style={{
                      position: "absolute",
                      ...(copiedAssetPlacement.kind === "terrain"
                        ? terrainAreaStyle(
                            copiedAssetPreview.x,
                            copiedAssetPreview.y,
                            copiedAssetPreview.width,
                            copiedAssetPreview.height
                          )
                        : {
                            left: isoToScreen(copiedAssetPreview.x / 2, copiedAssetPreview.y / 2).x - Math.max(68, copiedAssetPreview.width * 18) / 2,
                            top: isoToScreen(copiedAssetPreview.x / 2, copiedAssetPreview.y / 2).y - Math.max(68, copiedAssetPreview.height * 18),
                            width: Math.max(68, copiedAssetPreview.width * 18),
                            height: Math.max(68, copiedAssetPreview.height * 18),
                          }),
                      zIndex: 9999,
                      pointerEvents: "none",
                      border: copiedAssetPlacement.kind === "decoration"
                        ? `2px dashed ${copiedAssetPreview.valid ? "rgba(248,113,113,0.95)" : "rgba(248,113,113,0.55)"}`
                        : "none",
                      borderRadius: copiedAssetPlacement.kind === "decoration" ? 8 : 0,
                      clipPath: copiedAssetPlacement.kind === "terrain" && !isRoadAssetUrl(copiedAssetPlacement.url)
                        ? "polygon(50% 0,100% 50%,50% 100%,0 50%)"
                        : undefined,
                      background: copiedAssetPlacement.kind === "decoration" ? "rgba(248,113,113,0.14)" : "transparent",
                      boxShadow: copiedAssetPlacement.kind === "decoration" ? "0 0 20px rgba(248,113,113,0.22)" : "none",
                    }}
                  >
                    <img
                      src={copiedAssetPlacement.url}
                      alt=""
                      draggable={false}
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: copiedAssetPlacement.kind === "terrain" && !isRoadAssetUrl(copiedAssetPlacement.url) ? "cover" : "contain",
                        objectPosition: "center bottom",
                      }}
                    />
                    {copiedAssetPlacement.kind === "terrain" && <svg
                      aria-hidden="true"
                      viewBox="0 0 100 50"
                      preserveAspectRatio="none"
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
                    >
                      <polygon
                        points="50,1 99,25 50,49 1,25"
                        fill={copiedAssetPreview.valid ? "rgba(250,204,21,0.08)" : "rgba(248,113,113,0.12)"}
                        stroke={copiedAssetPreview.valid ? "rgba(250,204,21,0.98)" : "rgba(248,113,113,0.98)"}
                        strokeWidth="2"
                        strokeDasharray="6 4"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>}
                    <span
                      style={{
                        position: "absolute",
                        left: 4,
                        top: -24,
                        borderRadius: 999,
                        background: "var(--ac-glass)",
                        border: copiedAssetPreview.valid
                          ? "1px solid var(--ac-border)"
                          : "1px solid rgba(248,113,113,0.48)",
                        color: "var(--ac-text)",
                        padding: "2px 7px",
                        fontSize: 10,
                        fontWeight: 950,
                        whiteSpace: "nowrap",
                        zIndex: 1,
                      }}
                    >
                      复制 {copiedAssetPlacement.name}
                    </span>
                  </div>
                )}

                {(!buildingsHidden || buildPreviewMode) && <svg className="building-ground-shadows" width={mapWidth} height={mapHeight} viewBox={`0 0 ${mapWidth} ${mapHeight}`} aria-hidden="true">
                  {buildings.map((building) => {
                    const size = getPlacedBuildingSize(building, buildingTypes);
                    const footprintCenter = isoToScreen(
                      building.x + size[0] / 2,
                      building.y + size[1] / 2
                    );
                    const footprintSpan = size[0] + size[1];
                    const points = [
                      isoToScreen(building.x, building.y),
                      isoToScreen(building.x + size[0], building.y),
                      isoToScreen(building.x + size[0], building.y + size[1]),
                      isoToScreen(building.x, building.y + size[1]),
                    ].map((point) => `${point.x},${point.y}`).join(" ");
                    return <g key={building.id}>
                      <polygon className="building-ground-shadow building-ground-shadow--ambient" points={points} />
                      <ellipse
                        className="building-ground-shadow building-ground-shadow--contact"
                        cx={footprintCenter.x}
                        cy={footprintCenter.y + size[1] * 3}
                        rx={Math.max(24, footprintSpan * CELL_SIZE * 0.12)}
                        ry={Math.max(8, footprintSpan * CELL_SIZE * 0.035)}
                      />
                    </g>;
                  })}
                </svg>}

                {buildEditing && (
                  <svg className="building-footprints" width={mapWidth} height={mapHeight} viewBox={`0 0 ${mapWidth} ${mapHeight}`} aria-hidden="true">
                    {buildings.map((building) => {
                      const size = getPlacedBuildingSize(building, buildingTypes);
                      const points = [
                        isoToScreen(building.x, building.y),
                        isoToScreen(building.x + size[0], building.y),
                        isoToScreen(building.x + size[0], building.y + size[1]),
                        isoToScreen(building.x, building.y + size[1]),
                      ].map((point) => `${point.x},${point.y}`).join(" ");
                      return <polygon key={building.id} points={points} className={selectedId === building.id ? "is-selected" : ""} />;
                    })}
                  </svg>
                )}

                {(!buildingsHidden || buildPreviewMode) && buildings.map((b) => (
                  <BuildingSprite key={b.id} building={b} />
                ))}

                {Object.entries(npcs).map(([buildingId, npc]) => {
                  const building = buildings.find((b) => b.id === buildingId);
                  if (!building || npc.presence !== "walking") return null;
                  return <WalkingNpc key={buildingId} building={building} npc={npc} />;
                })}

                {buildEditing && dragPreview && (
                  <svg className="isometric-drag-preview" width={mapWidth} height={mapHeight} viewBox={`0 0 ${mapWidth} ${mapHeight}`} aria-hidden="true">
                    <polygon
                      points={[
                        isoToScreen(dragPreview.x, dragPreview.y),
                        isoToScreen(dragPreview.x + dragPreview.size[0], dragPreview.y),
                        isoToScreen(dragPreview.x + dragPreview.size[0], dragPreview.y + dragPreview.size[1]),
                        isoToScreen(dragPreview.x, dragPreview.y + dragPreview.size[1]),
                      ].map((point) => `${point.x},${point.y}`).join(" ")}
                      fill={dragPreview.valid ? "rgba(74,222,128,.28)" : "rgba(248,113,113,.3)"}
                      stroke={dragPreview.valid ? "#4ade80" : "#f87171"}
                      strokeWidth="3"
                    />
                  </svg>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {launchToast && (
        <div
          style={{
            position: "absolute",
            right: 18,
            bottom: 18,
            padding: "9px 12px",
            borderRadius: 9,
            background: "var(--ac-glass)",
            border: "1px solid rgba(96,165,250,0.34)",
            color: "var(--ac-text-soft)",
            fontSize: 12,
            fontWeight: 700,
            boxShadow: "0 12px 24px rgba(0,0,0,0.28)",
            pointerEvents: "none",
            zIndex: 50,
          }}
        >
          {launchToast}
        </div>
      )}
    </div>
  );
});

CityCanvas.displayName = "CityCanvas";

const viewControlsStyle: React.CSSProperties = {
  position: "fixed",
  top: 18,
  right: 18,
  zIndex: 180,
  width: 164,
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: 6,
  borderRadius: 8,
  background: "var(--ac-glass)",
  border: "1px solid var(--ac-border)",
  boxShadow: "0 8px 20px rgba(0,0,0,0.28)",
};

const viewButtonStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 6,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-raised)",
  color: "var(--ac-text)",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 800,
};

const terrainQuickControlsStyle: React.CSSProperties = {
  position: "absolute",
  transform: "translateY(-50%)",
  display: "flex",
  flexDirection: "column",
  gap: 5,
  padding: 4,
  borderRadius: 999,
  background: "var(--ac-build-panel, var(--ac-glass))",
  border: "1px solid var(--ac-build-border, rgba(250,204,21,0.38))",
  boxShadow: "0 8px 16px rgba(0,0,0,0.28)",
  pointerEvents: "auto",
  zIndex: 9999,
};

const terrainQuickButtonStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 999,
  border: "1px solid var(--ac-build-border, rgba(250,204,21,0.46))",
  background: "var(--ac-build-active-bg, var(--ac-control))",
  color: "var(--ac-build-active-text, #fef3c7)",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: "20px",
  fontWeight: 900,
  display: "grid",
  placeItems: "center",
  padding: 0,
};

const terrainQuickDeleteButtonStyle: React.CSSProperties = {
  ...terrainQuickButtonStyle,
  borderColor: "rgba(254,202,202,0.9)",
  background: "#dc2626",
  color: "#ffffff",
};
