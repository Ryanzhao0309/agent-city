import { useDraggable } from "@dnd-kit/core";
import { useEffect, useState } from "react";
import { useCityStore, buildingTypes } from "../store/cityStore";
import { SCENE_THEMES } from "../data/sceneThemes";
import { filterAvailableProjectAssets, getAssetThemePackId, getAvailableProjectAssets } from "../data/localAssets";
import { BUILDING_IMAGES } from "../pixelArt/imageAssets";
import { getCustomBuildingSize, getThemeBuildingSpec } from "../utils/customBuildingSize";
import { apiUrl } from "../services/api";
import type { CustomSceneAsset, MapSurrounding } from "../types";

export type DockTab = "building" | "road" | "decoration" | "map";
type AssetThemeFilter = "all" | string;

const FOUNDATION_BUILDINGS = [
  "city-hall",
  "skill-market",
  "task-hall",
  "archive",
  "data-center",
  "server-room",
  "theme-hall",
  "agent-home",
] as const;
const SINGLETON_TYPES = new Set([
  "city-hall",
  "skill-market",
  "task-hall",
  "archive",
  "data-center",
  "server-room",
  "theme-hall",
]);

const MAP_OPTIONS: Array<{ id: MapSurrounding; name: string }> = [
  { id: "megalithic", name: "原始地图包" },
  { id: "changan-city", name: "长安御街" },
  { id: "sky-observatory", name: "天空观星台" },
  { id: "volcanic-forge", name: "火山熔炉" },
  { id: "polar-crystal", name: "极地水晶" },
];

function sortDockAssets(a: CustomSceneAsset, b: CustomSceneAsset): number {
  const aNaturalRoad = a.url.includes("/natural-stone-roads/");
  const bNaturalRoad = b.url.includes("/natural-stone-roads/");
  if (aNaturalRoad !== bNaturalRoad) return aNaturalRoad ? -1 : 1;
  const aRoad = a.url.includes("/megalithic-roads/");
  const bRoad = b.url.includes("/megalithic-roads/");
  if (aRoad !== bRoad) return aRoad ? -1 : 1;
  const aMegalithic = a.url.includes("/megalithic-decor/");
  const bMegalithic = b.url.includes("/megalithic-decor/");
  if (aMegalithic !== bMegalithic) return aMegalithic ? -1 : 1;
  return a.name.localeCompare(b.name, "zh-CN");
}

export function PlacementDock({ tab, onTabChange, onClose }: { tab: DockTab; onTabChange: (tab: DockTab) => void; onClose: () => void }) {
  const buildings = useCityStore((s) => s.buildings);
  const selectedId = useCityStore((s) => s.selectedId);
  const customAssets = useCityStore((s) => s.customAssets);
  const mapSurrounding = useCityStore((s) => s.mapSurrounding);
  const installedThemePacks = useCityStore((s) => s.installedThemePacks);
  const upsertCustomAssets = useCityStore((s) => s.upsertCustomAssets);
  const selectCustomAsset = useCityStore((s) => s.selectCustomAsset);
  const setActiveTerrain = useCityStore((s) => s.setActiveTerrain);
  const setActiveDecoration = useCityStore((s) => s.setActiveDecoration);
  const setMapSurrounding = useCityStore((s) => s.setMapSurrounding);
  const showLaunchToast = useCityStore((s) => s.showLaunchToast);
  const removeBuilding = useCityStore((s) => s.removeBuilding);
  const selectedBuilding = buildings.find((building) => building.id === selectedId) ?? null;
  const availableCustomAssets = filterAvailableProjectAssets(customAssets, installedThemePacks);
  const terrainAssets = availableCustomAssets.filter(
    (asset) => asset.kind === "terrain" && asset.url.includes("/ground/walkable/tileable/")
  ).sort(sortDockAssets);
  const decorationAssets = availableCustomAssets.filter(
    (asset) => asset.kind === "decoration" && asset.url.includes("/decorations/blocking/")
  ).sort(sortDockAssets);
  const [pendingMapId, setPendingMapId] = useState<MapSurrounding>(mapSurrounding);
  const [assetThemeFilter, setAssetThemeFilter] = useState<AssetThemeFilter>("all");
  const pendingMap = SCENE_THEMES[pendingMapId];
  const mapChanged = tab === "map" && pendingMapId !== mapSurrounding;
  const assetThemeFilters = [
    { id: "all", name: "全部" },
    ...installedThemePacks.map((pack) => ({ id: pack.id, name: pack.name })),
  ];
  const isThemeFilterVisible = tab === "building" || tab === "road" || tab === "decoration";
  function matchesAssetThemeFilter(asset: CustomSceneAsset): boolean {
    if (assetThemeFilter === "all") return true;
    const packId = getAssetThemePackId(asset);
    return packId === assetThemeFilter;
  }
  const filteredTerrainAssets = terrainAssets.filter(matchesAssetThemeFilter);
  const filteredDecorationAssets = decorationAssets.filter(matchesAssetThemeFilter);
  const filteredBuildingAssets = availableCustomAssets
    .filter((asset) => {
      if (asset.kind !== "building" || !matchesAssetThemeFilter(asset)) return false;
      if (Object.values(BUILDING_IMAGES).includes(asset.url)) return false;
      return asset.source === "upload" || getAssetThemePackId(asset) !== null;
    })
    .sort(sortDockAssets);

  useEffect(() => {
    upsertCustomAssets(getAvailableProjectAssets(installedThemePacks));
    let cancelled = false;
    fetch(apiUrl("/api/assets"))
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.assets)) {
          upsertCustomAssets(filterAvailableProjectAssets(data.assets as CustomSceneAsset[], installedThemePacks));
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [installedThemePacks, upsertCustomAssets]);

  useEffect(() => {
    setPendingMapId(mapSurrounding);
  }, [mapSurrounding]);

  function applyMap() {
    setActiveTerrain(null);
    setActiveDecoration(null);
    selectCustomAsset(null);
    setMapSurrounding(pendingMapId);
    showLaunchToast(`已应用${pendingMap.label}地图，保存方案后生效`);
  }

  return (
    <section className="placement-dock" aria-label="城市素材栏">
      <div className="placement-dock__tabs" role="tablist" aria-label="素材分类">
        {([ ["building", "建筑"], ["road", "道路"], ["decoration", "装饰"], ["map", "地图"] ] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "is-active" : ""} onClick={() => onTabChange(id)}>{label}</button>
        ))}
        <div className="placement-dock__right-actions">
          {tab === "map" && (
            <button
              className="placement-dock__apply-map"
              disabled={!mapChanged}
              onClick={applyMap}
              aria-label={mapChanged ? `应用${pendingMap.label}地图` : "当前地图已应用"}
              title={mapChanged ? `应用${pendingMap.label}` : "当前地图已应用"}
            >
              应用
            </button>
          )}
          <button
            className="placement-dock__recycle"
            disabled={!selectedBuilding}
            onClick={() => selectedBuilding && removeBuilding(selectedBuilding.id)}
            aria-label={selectedBuilding ? `回收 ${selectedBuilding.name}` : "先选择一个建筑再回收"}
            title={selectedBuilding ? `回收 ${selectedBuilding.name}` : "先选择一个建筑"}
          >
            <span aria-hidden="true">↥</span>
            <strong>回收</strong>
            <small>{selectedBuilding?.name ?? "先选择建筑"}</small>
          </button>
          <button className="placement-dock__close" onClick={onClose} aria-label="关闭摆放栏">×</button>
        </div>
      </div>
      <div className="placement-dock__rail">
        {isThemeFilterVisible && (
          <div className="placement-dock__theme-filters" aria-label="素材主题筛选">
            {assetThemeFilters.map((filter) => (
              <button
                key={filter.id}
                className={assetThemeFilter === filter.id ? "is-active" : ""}
                onClick={() => setAssetThemeFilter(filter.id)}
                title={`只看${filter.name}素材`}
              >
                {filter.name}
              </button>
            ))}
          </div>
        )}
        {tab === "building" &&
          (assetThemeFilter !== "all" && assetThemeFilter !== "theme-megalithic-spring" ? null : FOUNDATION_BUILDINGS.map((type) => {
            const placed = buildings.some((building) => building.type === type);
            if (placed && SINGLETON_TYPES.has(type)) return null;
            return <DockBuilding key={type} type={type} />;
          }))}
        {tab === "building" && filteredBuildingAssets.map((asset) => {
          const spec = getThemeBuildingSpec(asset.url);
          const alreadyPlaced = spec && SINGLETON_TYPES.has(spec.type)
            ? buildings.some((building) => building.type === spec.type)
            : false;
          return (
            <DockCustomAsset
              key={asset.id}
              asset={asset}
              disabledReason={alreadyPlaced ? "已存在 · 先回收当前建筑" : undefined}
            />
          );
        })}
        {tab === "road" && filteredTerrainAssets.map((asset) => <DockTerrainAsset key={asset.id} asset={asset} />)}
        {tab === "decoration" && filteredDecorationAssets.map((asset) => <DockCustomAsset key={asset.id} asset={asset} />)}
        {isThemeFilterVisible &&
          ((tab === "building" && filteredBuildingAssets.length === 0 && assetThemeFilter !== "all" && assetThemeFilter !== "theme-megalithic-spring") ||
            (tab === "road" && filteredTerrainAssets.length === 0) ||
            (tab === "decoration" && filteredDecorationAssets.length === 0)) && (
            <div className="placement-dock__notice">这个主题包里暂时没有当前分类素材。</div>
          )}
        {tab === "map" && MAP_OPTIONS.map((option) => {
          const theme = SCENE_THEMES[option.id];
          const selected = pendingMapId === option.id;
          const active = mapSurrounding === option.id;
          return (
            <button
              key={option.id}
              className={`placement-map-card ${selected ? "is-selected" : ""}`}
              onClick={() => setPendingMapId(option.id)}
              title={theme.description}
            >
              <span className="placement-map-card__thumb" style={{ background: theme.background }} aria-hidden="true" />
              <span className="placement-map-card__body">
                <strong>{option.name}</strong>
                <small>{active ? "已应用" : selected ? "待应用" : "选择"}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DockTerrainAsset({ asset }: { asset: CustomSceneAsset }) {
  const selectCustomAsset = useCityStore((s) => s.selectCustomAsset);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `dock-asset-${asset.id}`,
    data: { source: "custom-asset", assetId: asset.id, kind: asset.kind },
  });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onPointerDown={(event) => {
        selectCustomAsset(null);
        listeners?.onPointerDown?.(event);
      }}
      className="placement-asset"
      style={{
        transform: transform ? `translate3d(${transform.x}px,${transform.y}px,0)` : undefined,
        opacity: isDragging ? .45 : 1,
        touchAction: "none",
      }}
      title={`拖动摆放 ${asset.name}`}
    >
      <img src={asset.url} alt="" loading="lazy" decoding="async" />
      <span>{asset.name}</span>
      <small>2 × 2 格 · 拖动摆放</small>
    </button>
  );
}

function DockCustomAsset({ asset, disabledReason }: { asset: CustomSceneAsset; disabledReason?: string }) {
  const selectCustomAsset = useCityStore((s) => s.selectCustomAsset);
  const disabled = Boolean(disabledReason);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `dock-asset-${asset.id}`,
    data: { source: "custom-asset", assetId: asset.id, kind: asset.kind },
    disabled,
  });
  const buildingSize = asset.kind === "building" ? getCustomBuildingSize(asset.url) : null;
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      disabled={disabled}
      onPointerDown={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        selectCustomAsset(null);
        listeners?.onPointerDown?.(event);
      }}
      className="placement-asset"
      style={{ transform: transform ? `translate3d(${transform.x}px,${transform.y}px,0)` : undefined, opacity: isDragging ? .45 : 1, touchAction: "none" }}
      title={disabledReason ?? `拖动摆放 ${asset.name}`}
    >
      <img src={asset.url} alt="" loading="lazy" decoding="async" />
      <span>{asset.name}</span>
      <small>{disabledReason ?? (buildingSize ? `${buildingSize[0]} × ${buildingSize[1]} 格` : "拖动摆放")}</small>
    </button>
  );
}

function DockBuilding({ type }: { type: string }) {
  const bt = buildingTypes[type];
  const setActiveTerrain = useCityStore((s) => s.setActiveTerrain);
  const selectCustomAsset = useCityStore((s) => s.selectCustomAsset);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `dock-${type}`, data: { source: "library", type } });
  return (
    <button ref={setNodeRef} {...listeners} {...attributes} onPointerDown={(event) => { setActiveTerrain(null); selectCustomAsset(null); listeners?.onPointerDown?.(event); }} className="placement-asset placement-asset--building" style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, opacity: isDragging ? 0.45 : 1, touchAction: "none" }} title={`拖动摆放 ${bt.name}`}>
      <img src={BUILDING_IMAGES[type]} alt="" loading="lazy" decoding="async" /><span>{bt.name}</span><small>{bt.size[0]} × {bt.size[1]} 格</small>
    </button>
  );
}
