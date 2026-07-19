import { useState, type CSSProperties } from "react";
import { useCityStore } from "../store/cityStore";
import { getBuildingPurpose } from "../utils/buildingPurpose";
import { AgentManagementPanel } from "./AgentManagementPanel";
import { KnowledgeStudio } from "./KnowledgeStudio";

export function CityHallModal() {
  const [activeArea, setActiveArea] = useState<"knowledge" | "management">("knowledge");
  const open = useCityStore((s) => s.cityHallOpen);
  const close = useCityStore((s) => s.closeCityHall);
  const buildings = useCityStore((s) => s.buildings);
  const selectBuilding = useCityStore((s) => s.selectBuilding);

  if (!open) return null;

  const cityHall = buildings.find((building) => getBuildingPurpose(building) === "city-hall") ?? null;

  function editBuilding() {
    if (!cityHall) return;
    selectBuilding(cityHall.id);
  }

  return (
    <div style={backdropStyle} onClick={close}>
      <section data-ui-surface="panel" style={modalStyle} onClick={(event) => event.stopPropagation()}>
        <header style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>市政大厅</div>
            <h2 style={titleStyle}>市政大厅</h2>
          </div>
          <div style={headerActionsStyle}>
            {cityHall && (
              <button style={editBtnStyle} onClick={editBuilding}>
                编辑建筑
              </button>
            )}
            <button style={closeStyle} onClick={close} aria-label="关闭市政大厅">×</button>
          </div>
        </header>

        <nav style={areaTabsStyle} aria-label="市政大厅功能区">
          <button style={{ ...areaTabStyle, ...(activeArea === "knowledge" ? activeAreaTabStyle : {}) }} onClick={() => setActiveArea("knowledge")}>
            <span style={areaIconStyle}>K</span>
            <span style={areaCopyStyle}><strong>城市知识库</strong><small>撰写、存放与分配基础知识</small></span>
          </button>
          <button style={{ ...areaTabStyle, ...(activeArea === "management" ? activeAreaTabStyle : {}) }} onClick={() => setActiveArea("management")}>
            <span style={areaIconStyle}>♙</span>
            <span style={areaCopyStyle}><strong>市政管理</strong><small>管理员与建筑职责</small></span>
          </button>
        </nav>

        <main style={contentStyle}>
          {activeArea === "knowledge" ? (
            <KnowledgeStudio />
          ) : (
            <AgentManagementPanel onLeaveCityHall={close} />
          )}
        </main>
      </section>
    </div>
  );
}

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 240000,
  background: "var(--ac-backdrop)",
  backdropFilter: "blur(5px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

const modalStyle: CSSProperties = {
  width: "min(1500px, 96vw)",
  height: "min(900px, 92vh)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  borderRadius: 22,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-panel)",
  color: "var(--ac-text)",
  boxShadow: "var(--ac-shadow)",
  backdropFilter: "blur(28px) saturate(1.16)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "20px 26px 18px",
  borderBottom: "1px solid var(--ac-border)",
  background: "transparent",
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
  fontSize: 27,
  letterSpacing: 0,
};

const headerActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const editBtnStyle: CSSProperties = {
  height: 40,
  padding: "0 15px",
  borderRadius: 11,
  border: "1px solid var(--ac-selected-border)",
  background: "var(--ac-selected)",
  color: "var(--ac-accent-text)",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 900,
};

const closeStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 11,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-strong)",
  color: "var(--ac-text)",
  cursor: "pointer",
  fontSize: 28,
  lineHeight: 1,
};

const contentStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  padding: "0 20px 20px",
};

const areaTabsStyle: CSSProperties = {
  height: 72,
  display: "flex",
  alignItems: "stretch",
  gap: 10,
  padding: "10px 20px",
  boxSizing: "border-box",
  background: "transparent",
};

const areaTabStyle: CSSProperties = {
  minWidth: 220,
  display: "flex",
  alignItems: "center",
  gap: 9,
  padding: "8px 14px",
  borderRadius: 12,
  border: "1px solid transparent",
  background: "transparent",
  color: "var(--ac-muted)",
  textAlign: "left",
  cursor: "pointer",
};

const activeAreaTabStyle: CSSProperties = {
  border: "1px solid var(--ac-selected-border)",
  background: "var(--ac-selected)",
  color: "var(--ac-text-soft)",
};

const areaIconStyle: CSSProperties = {
  width: 28,
  height: 28,
  display: "grid",
  placeItems: "center",
  borderRadius: 7,
  background: "rgba(96,165,250,.12)",
  color: "var(--ac-accent-text)",
  fontWeight: 950,
  fontSize: 16,
};

const areaCopyStyle: CSSProperties = {
  display: "grid",
  gap: 2,
};
