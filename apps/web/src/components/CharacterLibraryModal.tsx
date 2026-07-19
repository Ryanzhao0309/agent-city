import { useState, type CSSProperties } from "react";
import { getAllCharacters } from "../data/npcCatalog";
import { buildingTypes, useCityStore } from "../store/cityStore";
import { getCharacterDisplayName } from "../utils/agentStatus";

export function CharacterLibraryModal() {
  const buildingId = useCityStore((s) => s.characterLibraryBuildingId);
  const buildings = useCityStore((s) => s.buildings);
  const buildingResidents = useCityStore((s) => s.buildingResidents);
  const customCharacters = useCityStore((s) => s.customCharacters);
  const characterConfigs = useCityStore((s) => s.characterConfigs);
  const closeCharacterLibrary = useCityStore((s) => s.closeCharacterLibrary);
  const assignResident = useCityStore((s) => s.assignResident);
  const openCharacterConfig = useCityStore((s) => s.openCharacterConfig);
  const openCharacterChat = useCityStore((s) => s.openCharacterChat);
  const createCharacter = useCityStore((s) => s.createCharacter);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftRole, setDraftRole] = useState("");
  const [draftPersonality, setDraftPersonality] = useState("");
  const [templateId, setTemplateId] = useState("hermes");

  if (!buildingId) return null;

  const targetBuilding = buildings.find((building) => building.id === buildingId);
  if (!targetBuilding) return null;
  const characters = getAllCharacters(customCharacters);

  const assignedByCharacter = new Map<string, string>();
  for (const [assignedBuildingId, characterId] of Object.entries(buildingResidents)) {
    assignedByCharacter.set(characterId, assignedBuildingId);
  }

  return (
    <div style={backdropStyle} onClick={closeCharacterLibrary}>
      <section data-ui-surface="panel" style={modalStyle} onClick={(event) => event.stopPropagation()}>
        <header style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>Agent 角色库</div>
            <h2 style={titleStyle}>分配到 {targetBuilding.name}</h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={createBtnStyle} onClick={() => setCreating((value) => !value)}>
              创建 Agent
            </button>
            <button style={closeStyle} onClick={closeCharacterLibrary} aria-label="关闭 Agent 角色库">
              ×
            </button>
          </div>
        </header>

        {creating && (
          <section style={createPanelStyle}>
            <div style={formGridStyle}>
              <label style={fieldStyle}>
                <span>Agent 名称</span>
                <input style={inputStyle} value={draftName} onChange={(event) => setDraftName(event.target.value)} />
              </label>
              <label style={fieldStyle}>
                <span>职责</span>
                <input style={inputStyle} value={draftRole} onChange={(event) => setDraftRole(event.target.value)} />
              </label>
              <label style={fieldStyle}>
                <span>形象</span>
                <select style={inputStyle} value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                  {characters.map((character) => (
                    <option key={character.id} value={character.id}>
                      {getCharacterDisplayName(character, characterConfigs[character.id])}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label style={fieldStyle}>
              <span>初始人格</span>
              <textarea
                style={{ ...inputStyle, minHeight: 74, resize: "vertical" }}
                value={draftPersonality}
                onChange={(event) => setDraftPersonality(event.target.value)}
              />
            </label>
            <button
              style={saveCreateStyle}
              onClick={() => {
                const id = createCharacter({
                  name: draftName,
                  role: draftRole,
                  defaultBuildingType: targetBuilding.type,
                  personality: draftPersonality,
                  templateCharacterId: templateId,
                });
                assignResident(buildingId, id);
                setDraftName("");
                setDraftRole("");
                setDraftPersonality("");
                setCreating(false);
              }}
            >
              创建并分配
            </button>
          </section>
        )}

        <div style={gridStyle}>
          {characters.map((character) => {
            const assignedBuildingId = assignedByCharacter.get(character.id);
            const assignedBuilding = assignedBuildingId
              ? buildings.find((building) => building.id === assignedBuildingId)
              : null;
            const assignedHere = assignedBuildingId === buildingId;
            const config = characterConfigs[character.id];
            const brain = config?.brain;
            const displayName = getCharacterDisplayName(character, config);
            return (
              <button
                key={character.id}
                style={{
                  ...cardStyle,
                  borderColor: assignedHere ? character.accent : "var(--ac-border)",
                  boxShadow: assignedHere ? `0 0 0 2px ${character.accent}55` : "none",
                }}
                onClick={() => assignResident(buildingId, character.id)}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ ...portraitStyle, borderColor: `${character.accent}88` }}>
                    <img src={character.spriteUrl} alt={displayName} draggable={false} style={portraitImgStyle} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={nameStyle}>{displayName}</div>
                    <div style={roleStyle}>{character.role}</div>
                  </div>
                </div>
                <p style={lineStyle}>{character.homeLine}</p>
                <div style={cardFooterStyle}>
                  <div>
                    <div style={statusStyle}>
                      {assignedHere
                        ? "已分配到这里"
                        : assignedBuilding
                          ? `当前在 ${assignedBuilding.name}`
                          : `默认：${buildingTypes[character.defaultBuildingType]?.name ?? "自定义"}`}
                    </div>
                    <div style={brainStatusStyle}>
                      {brain?.enabled
                        ? brain.modelProfileId ? "已绑定全局模型" : "已启用，待选择模型"
                        : "AI Brain 未启用"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 5 }}>
                    <InlineAction label="对话" onAction={() => openCharacterChat(character.id)} />
                    <InlineAction label="配置" onAction={() => openCharacterConfig(character.id)} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <footer style={footerStyle}>
          <button style={clearStyle} onClick={() => assignResident(buildingId, null)}>
            清空 Agent
          </button>
        </footer>
      </section>
    </div>
  );
}

function InlineAction({ label, onAction }: { label: string; onAction: () => void }) {
  return (
    <span
      role="button"
      tabIndex={0}
      style={brainBtnStyle}
      onClick={(event) => {
        event.stopPropagation();
        onAction();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        onAction();
      }}
    >
      {label}
    </span>
  );
}

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 245000,
  background: "var(--ac-backdrop)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

const modalStyle: CSSProperties = {
  width: "min(880px, 94vw)",
  maxHeight: "86vh",
  overflow: "hidden",
  borderRadius: 10,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-raised)",
  color: "var(--ac-text)",
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 28px 80px rgba(0,0,0,0.55)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "16px 18px 12px",
  borderBottom: "1px solid var(--ac-border)",
  background: "linear-gradient(180deg, var(--ac-surface-raised), var(--ac-surface-raised))",
};

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: "var(--ac-kicker)",
  fontWeight: 900,
};

const titleStyle: CSSProperties = {
  margin: "3px 0 0",
  fontSize: 21,
  letterSpacing: 0,
};

const closeStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 6,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-strong)",
  color: "var(--ac-text)",
  cursor: "pointer",
  fontSize: 24,
  lineHeight: "28px",
};

const createBtnStyle: CSSProperties = {
  minHeight: 34,
  borderRadius: 6,
  border: "1px solid rgba(253,230,138,0.34)",
  background: "rgba(253,230,138,0.14)",
  color: "var(--ac-kicker)",
  cursor: "pointer",
  padding: "0 12px",
  fontWeight: 900,
};

const createPanelStyle: CSSProperties = {
  margin: 14,
  padding: 14,
  borderRadius: 8,
  border: "1px solid rgba(253,230,138,0.26)",
  background: "var(--ac-glass)",
  display: "grid",
  gap: 10,
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  color: "var(--ac-text-soft)",
  fontSize: 11,
  fontWeight: 900,
};

const inputStyle: CSSProperties = {
  width: "100%",
  borderRadius: 6,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-strong)",
  color: "var(--ac-text)",
  padding: "9px 10px",
  fontWeight: 750,
};

const saveCreateStyle: CSSProperties = {
  justifySelf: "end",
  minHeight: 36,
  borderRadius: 6,
  border: 0,
  background: "var(--ac-kicker)",
  color: "#1f2937",
  padding: "0 14px",
  fontWeight: 950,
  cursor: "pointer",
};

const gridStyle: CSSProperties = {
  padding: 16,
  overflowY: "auto",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
  gap: 10,
};

const cardStyle: CSSProperties = {
  textAlign: "left",
  borderRadius: 8,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-raised)",
  color: "var(--ac-text)",
  padding: 10,
  minHeight: 166,
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
};

const portraitStyle: CSSProperties = {
  width: 42,
  height: 48,
  borderRadius: 6,
  border: "1px solid",
  background: "var(--ac-border)",
  overflow: "hidden",
  flexShrink: 0,
};

const portraitImgStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  objectPosition: "center bottom",
  imageRendering: "pixelated",
};

const nameStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
};

const roleStyle: CSSProperties = {
  fontSize: 10,
  color: "var(--ac-muted)",
  marginTop: 2,
};

const lineStyle: CSSProperties = {
  margin: "10px 0",
  color: "var(--ac-text-soft)",
  fontSize: 11,
  lineHeight: 1.35,
};

const statusStyle: CSSProperties = {
  fontSize: 10,
  color: "var(--ac-kicker)",
  fontWeight: 900,
};

const brainStatusStyle: CSSProperties = {
  marginTop: 3,
  fontSize: 9,
  color: "var(--ac-muted)",
  fontWeight: 800,
};

const cardFooterStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: 8,
};

const brainBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 28,
  height: 24,
  padding: "0 6px",
  borderRadius: 6,
  border: "1px solid rgba(147,197,253,0.36)",
  background: "var(--ac-surface-raised)",
  color: "var(--ac-accent-text)",
  cursor: "pointer",
  fontSize: 10,
  fontWeight: 900,
  flexShrink: 0,
};

const footerStyle: CSSProperties = {
  padding: "10px 16px 14px",
  borderTop: "1px solid var(--ac-border)",
  display: "flex",
  justifyContent: "flex-end",
};

const clearStyle: CSSProperties = {
  padding: "7px 12px",
  borderRadius: 6,
  border: "1px solid rgba(239,68,68,0.42)",
  background: "#2e1f1f",
  color: "#fecaca",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 900,
};
