import { useState, type CSSProperties } from "react";
import { getAssignedResident } from "../data/npcCatalog";
import { useCityStore } from "../store/cityStore";
import type { PlacedBuilding, PlacedNpcState } from "../types";
import { TERRAIN_SUBDIV, isoToScreen } from "../utils/grid";
import { npcDepth } from "../utils/depth";
import { getCharacterDisplayName } from "../utils/agentStatus";

export function WalkingNpc({
  building,
  npc,
}: {
  building: PlacedBuilding;
  npc: PlacedNpcState;
}) {
  const buildingResidents = useCityStore((s) => s.buildingResidents);
  const customCharacters = useCityStore((s) => s.customCharacters);
  const characterConfigs = useCityStore((s) => s.characterConfigs);
  const resident = getAssignedResident(building, buildingResidents, customCharacters);
  const openCharacterChat = useCityStore((s) => s.openCharacterChat);
  const openCharacterConfig = useCityStore((s) => s.openCharacterConfig);
  const returnNpcHome = useCityStore((s) => s.returnNpcHome);
  const activeTerrain = useCityStore((s) => s.activeTerrain);
  const activeDecoration = useCityStore((s) => s.activeDecoration);
  if (!resident || npc.presence !== "walking") return null;

  const disabledForPainting = Boolean(activeTerrain || activeDecoration);
  const depth = npcDepth({ x: npc.x, y: npc.y });
  const point = isoToScreen(npc.x / TERRAIN_SUBDIV, npc.y / TERRAIN_SUBDIV);
  const displayName = getCharacterDisplayName(resident, characterConfigs[resident.id]);
  const [menuOpen, setMenuOpen] = useState(false);
  const walkSprite = resident.walkSprite;
  const direction = npc.direction ?? "down";
  const rowByDirection = { down: 0, right: 1, left: 1, up: 2 } as const;
  const spriteWidth = walkSprite?.displayWidth ?? 42;
  const spriteHeight = walkSprite?.displayHeight ?? 54;
  const spriteBottom = walkSprite ? 0 : 2;
  const animatedSpriteCssVars = walkSprite
    ? ({
        "--walk-cycle-distance": `${-walkSprite.columns * spriteWidth}px`,
      } as CSSProperties)
    : {};

  return (
    <div
      onClick={(event) => {
        event.stopPropagation();
        setMenuOpen((value) => !value);
      }}
      style={{
        position: "absolute",
        left: point.x - 21,
        top: point.y - 56,
        width: 42,
        height: 58,
        zIndex: depth,
        cursor: "pointer",
        pointerEvents: disabledForPainting ? "none" : "auto",
        transition: "left 1.75s linear, top 1.75s linear",
      }}
      title={`${displayName} is out walking`}
    >
      <div style={{ ...shadowStyle, background: `${resident.accent}55` }} />
      {walkSprite ? (
        <div
          role="img"
          aria-label={displayName}
          className="walking-npc-sprite"
          style={{
            ...animatedSpriteStyle,
            ...animatedSpriteCssVars,
            left: (42 - spriteWidth) / 2,
            bottom: spriteBottom,
            width: spriteWidth,
            height: spriteHeight,
            backgroundImage: `url('${walkSprite.url}')`,
            backgroundSize: `${walkSprite.columns * spriteWidth}px ${walkSprite.rows * spriteHeight}px`,
            backgroundPositionY: `${-rowByDirection[direction] * spriteHeight}px`,
            animationDuration: `${walkSprite.columns * 280}ms`,
            animationTimingFunction: `steps(${walkSprite.columns})`,
            transform: direction === "left" ? "scaleX(-1)" : undefined,
          }}
        />
      ) : (
        <img
          src={resident.spriteUrl}
          alt={displayName}
          decoding="async"
          draggable={false}
          style={spriteStyle}
        />
      )}
      {menuOpen && (
        <div className="walking-npc-menu" role="dialog" aria-label={`${displayName} 操作`} onClick={(event) => event.stopPropagation()}>
          <strong>{displayName}</strong><small>{resident.role}</small>
          <div>
            <button onClick={() => { setMenuOpen(false); openCharacterConfig(resident.id); }}><span>ⓘ</span>信息</button>
            <button onClick={() => { setMenuOpen(false); openCharacterChat(resident.id); }}><span>◌</span>对话</button>
            <button onClick={() => { setMenuOpen(false); returnNpcHome(building.id); }}><span>⌂</span>回家</button>
          </div>
        </div>
      )}
    </div>
  );
}

const spriteStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  bottom: 2,
  width: 42,
  height: 54,
  objectFit: "contain",
  objectPosition: "center bottom",
  imageRendering: "pixelated",
  filter: "drop-shadow(0 3px 3px rgba(0,0,0,0.45))",
};

const animatedSpriteStyle: CSSProperties = {
  position: "absolute",
  backgroundRepeat: "no-repeat",
  backgroundPositionX: 0,
  imageRendering: "pixelated",
  filter: "drop-shadow(0 3px 3px rgba(0,0,0,0.45))",
  animationName: "walking-npc-walk-cycle",
  animationIterationCount: "infinite",
};

const shadowStyle: CSSProperties = {
  position: "absolute",
  left: 5,
  bottom: 0,
  width: 30,
  height: 6,
  borderRadius: "50%",
  filter: "blur(1px)",
};
