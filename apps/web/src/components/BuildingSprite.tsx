import { useDraggable } from "@dnd-kit/core";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CELL_SIZE, getPlacedBuildingSize, isoToScreen } from "../utils/grid";
import { buildingTypes, useCityStore } from "../store/cityStore";
import type { PlacedBuilding } from "../types";
import { BUILDING_IMAGES } from "../pixelArt/imageAssets";
import { buildingDepth } from "../utils/depth";
import { getAssignedResident } from "../data/npcCatalog";
import { getBuildingAgentStatus } from "../utils/agentStatus";
import { getBuildingPurpose } from "../utils/buildingPurpose";
import { getBuildingBaselineShift } from "../utils/buildingVisuals";

export function BuildingSprite({ building }: { building: PlacedBuilding }) {
  const bt = buildingTypes[building.type];
  const imageSrc = building.customImageUrl ?? BUILDING_IMAGES[building.type];
  const buildMode = useCityStore((s) => s.buildMode);
  const buildPreviewMode = useCityStore((s) => s.buildPreviewMode);
  const selectedId = useCityStore((s) => s.selectedId);
  const activeTerrain = useCityStore((s) => s.activeTerrain);
  const activeCustomAsset = useCityStore((s) =>
    s.customAssets.find((asset) => asset.id === s.activeCustomAssetId)
  );
  const npcState = useCityStore((s) => s.npcs[building.id]);
  const buildingResidents = useCityStore((s) => s.buildingResidents);
  const customCharacters = useCityStore((s) => s.customCharacters);
  const characterConfigs = useCityStore((s) => s.characterConfigs);
  const configuredSecretKeys = useCityStore((s) => s.configuredSecretKeys);
  const showBuildingStatusIndicators = useCityStore((s) => s.showBuildingStatusIndicators);
  const showBuildingLabels = useCityStore((s) => s.showBuildingLabels);
  const selectBuilding = useCityStore((s) => s.selectBuilding);
  const openCityHall = useCityStore((s) => s.openCityHall);
  const openSkillHall = useCityStore((s) => s.openSkillHall);
  const openBookmarkManager = useCityStore((s) => s.openBookmarkManager);
  const openThemeHall = useCityStore((s) => s.openThemeHall);
  const openTodoHall = useCityStore((s) => s.openTodoHall);
  const [hovering, setHovering] = useState(false);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  const purpose = getBuildingPurpose(building);
  const draggable = buildMode && !buildPreviewMode;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `building-${building.id}`,
    data: { source: "building", id: building.id },
    disabled: !draggable,
  });

  const isSelected = selectedId === building.id;
  const paintingTerrain = Boolean(activeTerrain || activeCustomAsset?.kind === "terrain");
  const residentAway = npcState?.presence === "walking";
  const size = getPlacedBuildingSize(building, buildingTypes);
  const footprintCenter = isoToScreen(building.x + size[0] / 2, building.y + size[1] / 2);
  const visualWidth = Math.max(156, size[0] * CELL_SIZE);
  const visualHeight = Math.max(150, size[1] * CELL_SIZE * 0.92);
  const baselineShift = getBuildingBaselineShift(imageSrc, visualHeight);
  const hitWidth = Math.max(58, Math.min(visualWidth * 0.78, size[0] * CELL_SIZE * 0.95));
  const hitHeight = Math.max(44, Math.min(visualHeight * 0.34, size[1] * CELL_SIZE * 0.72));
  const depth = buildingDepth({ x: building.x, y: building.y, size });
  const resident = getAssignedResident(building, buildingResidents, customCharacters);
  const agentStatus = getBuildingAgentStatus({
    building,
    resident,
    config: resident ? characterConfigs[resident.id] : undefined,
    npc: npcState,
    configuredSecretKeys,
  });

  function handleClick() {
    if (buildMode && buildPreviewMode) return;
    if (!buildMode && purpose === "city-hall") {
      openCityHall();
      return;
    }
    if (!buildMode && purpose === "skill-hall") {
      openSkillHall();
      return;
    }
    if (!buildMode && purpose === "todo-hall") {
      openTodoHall();
      return;
    }
    if (!buildMode && purpose === "theme-hall") {
      openThemeHall();
      return;
    }
    if (!buildMode && purpose === "bookmarks") {
      openBookmarkManager(building.id);
      return;
    }
    selectBuilding(building.id);
  }

  useEffect(() => {
    if (!hovering) return;
    function handlePointerMove(event: PointerEvent) {
      setMouse({ x: event.clientX, y: event.clientY });
    }
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [hovering]);

  useEffect(() => {
    if (!imageSrc) return;
    const image = new Image();
    image.src = imageSrc;
    void image.decode?.().catch(() => undefined);
    return () => {
      image.src = "";
    };
  }, [imageSrc]);

  return (
    <div
      ref={setNodeRef}
      role="group"
      data-building-id={building.id}
      aria-label={building.name}
      style={{
        position: "absolute",
        left: footprintCenter.x - visualWidth / 2,
        top: footprintCenter.y - visualHeight + size[1] * 5,
        width: visualWidth,
        height: visualHeight,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        opacity: isDragging ? 0.35 : 1,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : "translateZ(0)",
        pointerEvents: "none",
        touchAction: "none",
        zIndex: isDragging ? 20000 : isSelected ? depth + 1 : depth,
        backfaceVisibility: "hidden",
        // Building labels intentionally sit below the sprite bounds. Paint containment
        // clips that overflow, making the "显示建筑名字" setting appear ineffective.
        contain: "layout",
        overflow: "visible",
        willChange: "transform",
      }}
    >
      {imageSrc && (
        <img
          src={imageSrc}
          alt={bt?.name ?? building.name}
          draggable={false}
          loading="eager"
          decoding="async"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            objectPosition: "center bottom",
            transform: `translate3d(0, ${baselineShift}px, 0)`,
            backfaceVisibility: "hidden",
            willChange: "transform",
            filter: isSelected
              ? "drop-shadow(0 0 2px rgba(255,255,255,.85)) drop-shadow(0 0 8px rgba(56,189,248,.72)) drop-shadow(0 1px 1px rgba(39,52,21,0.14))"
              : "drop-shadow(0 1px 1px rgba(39,52,21,0.14))",
          }}
        />
      )}

      <button
        {...(draggable ? { ...listeners, ...attributes } : {})}
        aria-label={building.name}
        onClick={handleClick}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onMouseMove={(event) => setMouse({ x: event.clientX, y: event.clientY })}
        style={{
          position: "absolute",
          left: "50%",
          bottom: 2,
          width: hitWidth,
          height: hitHeight,
          transform: "translateX(-50%)",
          border: 0,
          padding: 0,
          background: "transparent",
          clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)",
          cursor: paintingTerrain ? "crosshair" : draggable ? "grab" : buildPreviewMode ? "default" : "pointer",
          pointerEvents: paintingTerrain ? "none" : "auto",
          touchAction: "none",
        }}
      />

      {residentAway && (
        <span
          style={{
            position: "absolute",
            top: 2,
            left: 2,
            padding: "1px 4px",
            borderRadius: 4,
            background: "var(--ac-glass)",
            color: "var(--ac-kicker)",
            border: "1px solid rgba(255,226,138,0.35)",
            fontSize: 8,
            fontWeight: 900,
            letterSpacing: 0.4,
          }}
        >
          OUT
        </span>
      )}

      {/* agent runtime status dot */}
      {showBuildingStatusIndicators && <span
        className="building-status-indicator"
        style={{
          position: "absolute",
          bottom: 12,
          left: "50%",
          transform: "translateX(-50%)",
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: npcState?.runtimeStatus === "waiting_approval" || npcState?.runtimeStatus === "waiting_user" ? "#f59e0b"
            : npcState?.runtimeStatus === "running" || npcState?.runtimeStatus === "queued" ? "#3b82f6"
            : npcState?.runtimeStatus === "succeeded" ? "#22c55e"
            : npcState?.runtimeStatus === "failed" ? "#ef4444"
            : agentStatus.ready ? "#38bdf8" : "#ef4444",
          border: "1px solid rgba(0,0,0,0.45)",
          boxShadow: npcState?.runtimeStatus === "running" || npcState?.runtimeStatus === "queued"
            ? "0 0 12px rgba(59,130,246,0.95)"
            : agentStatus.ready
            ? "0 0 10px rgba(56,189,248,0.9)"
            : "0 0 0 2px rgba(239,68,68,0.22)",
        }}
      />}

      {hovering && !paintingTerrain && (
        createPortal(
          <div style={createStatusCardStyle(mouse)}>
            <div style={statusTitleStyle}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: agentStatus.ready ? "#38bdf8" : "#ef4444",
                  boxShadow: agentStatus.ready ? "0 0 8px rgba(56,189,248,0.8)" : "none",
                  flexShrink: 0,
                }}
              />
              {agentStatus.label}
            </div>
            <div style={statusNameStyle}>{building.name}</div>
            <div style={statusRowStyle}>Agent：{agentStatus.residentName}</div>
            <div style={statusRowStyle}>
              位置：{agentStatus.presence === "walking" ? "外出散步" : agentStatus.presence === "home" ? "在家" : "无"}
            </div>
            <div style={statusRowStyle}>AI Brain：{agentStatus.brainEnabled ? "已启用" : "未启用"}</div>
            <div style={statusRowStyle}>模型：{agentStatus.modelReady ? "已选择" : "未选择"}</div>
            <div style={statusDetailStyle}>{agentStatus.detail}</div>
          </div>,
          document.body
        )
      )}

      {/* label */}
      {showBuildingLabels && <div
        className="building-name-label"
        style={{
          position: "absolute",
          bottom: -18,
          left: "50%",
          transform: "translateX(-50%)",
          whiteSpace: "nowrap",
          fontSize: 11,
          lineHeight: 1.35,
          fontWeight: 800,
          color: "var(--ac-map-label-text)",
          background: "var(--ac-map-label-bg)",
          border: isSelected ? "1px solid rgba(56,189,248,0.7)" : "1px solid var(--ac-border)",
          padding: "2px 7px",
          borderRadius: 5,
          letterSpacing: 0.3,
          boxShadow: "var(--ac-map-label-shadow)",
          backdropFilter: "blur(6px) saturate(1.1)",
          zIndex: 2,
          pointerEvents: "none",
        }}
      >
        {building.name}
      </div>}
    </div>
  );
}

const statusCardStyle: React.CSSProperties = {
  position: "fixed",
  width: 168,
  borderRadius: 8,
  border: "1px solid rgba(226,232,240,0.24)",
  background: "var(--ac-glass)",
  color: "var(--ac-text)",
  padding: 8,
  boxShadow: "0 14px 34px rgba(0,0,0,0.38)",
  backdropFilter: "blur(14px) saturate(1.18)",
  zIndex: 2147483647,
  pointerEvents: "none",
};

function createStatusCardStyle(mouse: { x: number; y: number }): React.CSSProperties {
  const width = 188;
  const height = 174;
  const left = Math.min(window.innerWidth - width - 12, mouse.x + 16);
  const top = Math.min(window.innerHeight - height - 12, mouse.y + 16);
  return {
    ...statusCardStyle,
    width,
    left: Math.max(12, left),
    top: Math.max(12, top),
  };
}

const statusTitleStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  fontWeight: 900,
  marginBottom: 6,
};

const statusNameStyle: React.CSSProperties = {
  marginBottom: 5,
  color: "var(--ac-text)",
  fontSize: 12,
  fontWeight: 950,
  lineHeight: 1.25,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const statusRowStyle: React.CSSProperties = {
  fontSize: 10,
  color: "var(--ac-text-soft)",
  lineHeight: 1.45,
};

const statusDetailStyle: React.CSSProperties = {
  marginTop: 5,
  borderTop: "1px solid var(--ac-border)",
  paddingTop: 5,
  fontSize: 10,
  color: "var(--ac-muted)",
  lineHeight: 1.35,
};
