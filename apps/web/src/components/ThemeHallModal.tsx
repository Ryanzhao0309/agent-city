import type { CSSProperties } from "react";
import { BUILT_IN_THEME_PACKS, useCityStore } from "../store/cityStore";
import { getBuildingPurpose } from "../utils/buildingPurpose";

export function ThemeHallModal() {
  const open = useCityStore((s) => s.themeHallOpen);
  const close = useCityStore((s) => s.closeThemeHall);
  const installedThemePacks = useCityStore((s) => s.installedThemePacks);
  const installThemePack = useCityStore((s) => s.installThemePack);
  const buildings = useCityStore((s) => s.buildings);
  const selectBuilding = useCityStore((s) => s.selectBuilding);
  const save = useCityStore((s) => s.save);

  if (!open) return null;

  const installedIds = new Set(installedThemePacks.map((pack) => pack.id));
  const builtInIds = new Set(BUILT_IN_THEME_PACKS.map((pack) => pack.id));
  const themePacks = [
    ...BUILT_IN_THEME_PACKS,
    ...installedThemePacks.filter((pack) => !builtInIds.has(pack.id)),
  ];
  const themeHallBuilding = buildings.find((building) => getBuildingPurpose(building) === "theme-hall") ?? null;

  function installAndSave(packId: string) {
    const pack = BUILT_IN_THEME_PACKS.find((item) => item.id === packId);
    if (!pack) return;
    installThemePack(pack);
    window.setTimeout(() => void save(), 0);
  }

  function editBuilding() {
    if (!themeHallBuilding) return;
    selectBuilding(themeHallBuilding.id);
  }

  return (
    <div style={backdropStyle} onClick={close}>
      <section data-ui-surface="panel" style={modalStyle} onClick={(event) => event.stopPropagation()}>
        <header style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>主题大厅</div>
            <h2 style={titleStyle}>城市主题大厅</h2>
          </div>
          <div style={headerActionsStyle}>
            {themeHallBuilding && (
              <button style={editBtnStyle} onClick={editBuilding}>
                编辑建筑
              </button>
            )}
            <button style={closeStyle} onClick={close} aria-label="Close theme hall">×</button>
          </div>
        </header>

        <main style={gridStyle}>
          {themePacks.map((pack) => {
            const installed = installedIds.has(pack.id);
            const hasStats = pack.downloadCount !== undefined || pack.likeCount !== undefined;
            return (
              <article key={pack.id} style={cardStyle}>
                <div style={previewStyle}>
                  <img src={pack.previewUrl} alt={pack.name} loading="lazy" decoding="async" style={previewImgStyle} />
                  <span style={iconStyle}>{pack.icon}</span>
                </div>
                <div style={cardBodyStyle}>
                  <div style={kindStyle}>{pack.kind}</div>
                  <h3 style={cardTitleStyle}>{pack.name}</h3>
                  {pack.creatorName && <div style={creatorStyle}>创作者 · {pack.creatorName}</div>}
                  <p style={summaryStyle}>{pack.summary}</p>
                  {hasStats && (
                    <div style={statsStyle} aria-label="主题数据">
                      {pack.downloadCount !== undefined && (
                        <span title="下载量">↓ {pack.downloadCount.toLocaleString("zh-CN")}</span>
                      )}
                      {pack.likeCount !== undefined && (
                        <span title="点赞量">♥ {pack.likeCount.toLocaleString("zh-CN")}</span>
                      )}
                    </div>
                  )}
                  <div style={actionsStyle}>
                    <button
                      style={{
                        ...secondaryBtnStyle,
                        opacity: installed ? 0.66 : 1,
                        cursor: installed ? "default" : "pointer",
                      }}
                      disabled={installed}
                      onClick={() => installAndSave(pack.id)}
                    >
                      {installed ? "已下载" : "下载"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </main>
      </section>
    </div>
  );
}

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 240000,
  background: "rgba(2,6,23,0.68)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const modalStyle: CSSProperties = {
  width: "min(980px, 96vw)",
  maxHeight: "88vh",
  overflow: "hidden",
  borderRadius: 10,
  border: "1px solid rgba(103,232,249,0.25)",
  background: "var(--ac-surface)",
  color: "var(--ac-text)",
  boxShadow: "0 24px 80px rgba(0,0,0,0.46)",
  display: "flex",
  flexDirection: "column",
};

const headerStyle: CSSProperties = {
  padding: "18px 22px",
  borderBottom: "1px solid var(--ac-border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const eyebrowStyle: CSSProperties = {
  color: "#67e8f9",
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 2,
  textTransform: "uppercase",
};

const titleStyle: CSSProperties = {
  margin: "4px 0 0",
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
  padding: "0 13px",
  borderRadius: 8,
  border: "1px solid rgba(147,197,253,0.38)",
  background: "var(--ac-control)",
  color: "var(--ac-accent-text)",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 900,
};

const closeStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 8,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-strong)",
  color: "var(--ac-text)",
  cursor: "pointer",
  fontSize: 30,
  lineHeight: 1,
};

const gridStyle: CSSProperties = {
  padding: 18,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: 14,
  overflowY: "auto",
};

const cardStyle: CSSProperties = {
  border: "1px solid var(--ac-border)",
  borderRadius: 8,
  background: "var(--ac-control)",
  overflow: "hidden",
};

const previewStyle: CSSProperties = {
  position: "relative",
  height: 142,
  background: "var(--ac-field)",
};

const previewImgStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const iconStyle: CSSProperties = {
  position: "absolute",
  left: 12,
  bottom: 10,
  width: 36,
  height: 36,
  display: "grid",
  placeItems: "center",
  borderRadius: 8,
  background: "var(--ac-glass)",
  border: "1px solid rgba(255,255,255,0.24)",
  fontSize: 20,
  backdropFilter: "blur(10px)",
};

const cardBodyStyle: CSSProperties = {
  padding: 14,
};

const kindStyle: CSSProperties = {
  color: "#67e8f9",
  fontSize: 10,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: 1,
};

const cardTitleStyle: CSSProperties = {
  margin: "5px 0 3px",
  fontSize: 18,
};

const creatorStyle: CSSProperties = {
  color: "var(--ac-text-soft)",
  fontSize: 12,
  fontWeight: 800,
  marginBottom: 9,
};

const summaryStyle: CSSProperties = {
  minHeight: 42,
  margin: 0,
  color: "#aab7cc",
  fontSize: 13,
  lineHeight: 1.45,
};

const statsStyle: CSSProperties = {
  minHeight: 20,
  display: "flex",
  alignItems: "center",
  gap: 14,
  marginTop: 10,
  color: "var(--ac-muted)",
  fontSize: 12,
  fontWeight: 800,
};

const actionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 14,
};

const secondaryBtnStyle: CSSProperties = {
  border: "1px solid var(--ac-border)",
  borderRadius: 6,
  background: "var(--ac-surface-strong)",
  color: "var(--ac-text-soft)",
  padding: "8px 12px",
  fontWeight: 900,
  cursor: "pointer",
};
