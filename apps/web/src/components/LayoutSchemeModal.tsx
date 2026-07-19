import { type CSSProperties } from "react";
import type { LayoutSchemeSnapshot } from "../types";
import { useCityStore } from "../store/cityStore";

const slots = [1, 2, 3] as const;

export function LayoutSchemeModal() {
  const open = useCityStore((s) => s.layoutSchemeModalOpen);
  const close = useCityStore((s) => s.closeLayoutSchemeModal);
  const layoutSchemes = useCityStore((s) => s.layoutSchemes);
  const activeLayoutSchemeId = useCityStore((s) => s.activeLayoutSchemeId);
  const saveCurrentLayoutToScheme = useCityStore((s) => s.saveCurrentLayoutToScheme);
  const editLayoutScheme = useCityStore((s) => s.editLayoutScheme);
  const activateLayoutScheme = useCityStore((s) => s.activateLayoutScheme);

  if (!open) return null;

  return (
    <div style={backdropStyle} onClick={close}>
      <section data-ui-surface="panel" style={modalStyle} onClick={(event) => event.stopPropagation()}>
        <header style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>BUILD</div>
            <h2 style={titleStyle}>城市布局方案</h2>
          </div>
          <button style={closeStyle} onClick={close} aria-label="关闭布局方案">
            ×
          </button>
        </header>

        <main style={contentStyle}>
          {slots.map((slot) => {
            const scheme = layoutSchemes.find((item) => item.slot === slot) ?? null;
            const active = Boolean(scheme && scheme.id === activeLayoutSchemeId);
            return (
              <article
                key={slot}
                style={{
                  ...schemeCardStyle,
                  borderColor: active ? "rgba(253,230,138,.75)" : schemeCardStyle.borderColor,
                }}
              >
                <div style={cardTopStyle}>
                  <div>
                    <h3 style={cardTitleStyle}>方案 {slot}</h3>
                    <p style={mutedStyle}>
                      {scheme ? `${scheme.snapshot.buildings.length} 个建筑 · ${scheme.snapshot.mapSurrounding ?? "默认地图"}` : "空方案"}
                    </p>
                  </div>
                  {active && <span style={activeBadgeStyle}>当前</span>}
                </div>
                <PreviewFrame previewDataUrl={scheme?.previewDataUrl ?? ""} snapshot={scheme?.snapshot ?? null} />
                <div style={cardActionsStyle}>
                  <button style={smallBtnStyle} onClick={() => void saveCurrentLayoutToScheme(slot)}>
                    保存到此方案
                  </button>
                  <button
                    style={smallBtnStyle}
                    disabled={!scheme || active}
                    onClick={() => scheme && activateLayoutScheme(scheme.id)}
                  >
                    {active ? "当前启用" : "启用"}
                  </button>
                  <button
                    style={smallBtnStyle}
                    disabled={!scheme}
                    onClick={() => scheme && editLayoutScheme(scheme.id)}
                  >
                    编辑
                  </button>
                </div>
              </article>
            );
          })}
        </main>
      </section>
    </div>
  );
}

function MiniMap({ snapshot }: { snapshot: LayoutSchemeSnapshot | null }) {
  if (!snapshot) {
    return (
      <div style={emptyPreviewStyle}>
        空方案
      </div>
    );
  }
  const buildings = snapshot.buildings ?? [];
  const assets = snapshot.placedCustomAssets ?? [];
  const ground = Object.keys(snapshot.ground ?? {}).slice(0, 160);
  const blocked = Object.keys(snapshot.blockedWalkCells ?? {}).slice(0, 120);
  const scaleX = 220 / 192;
  const scaleY = 130 / 192;
  return (
    <svg style={previewStyle} viewBox="0 0 220 130" role="img" aria-label="布局缩略图">
      <rect width="220" height="130" rx="10" fill="var(--ac-glass)" />
      {ground.map((key) => {
        const [x, y] = key.split(",").map(Number);
        return <rect key={`g-${key}`} x={x * scaleX / 2} y={y * scaleY / 2} width="2" height="2" fill="var(--ac-border)" />;
      })}
      {blocked.map((key) => {
        const [x, y] = key.split(",").map(Number);
        return <rect key={`b-${key}`} x={x * scaleX} y={y * scaleY} width="3" height="3" fill="rgba(251,146,60,.68)" />;
      })}
      {assets.filter((asset) => asset.kind === "decoration").slice(0, 80).map((asset) => (
        <rect
          key={asset.id}
          x={(asset.x / 2) * scaleX}
          y={(asset.y / 2) * scaleY}
          width={Math.max(3, (asset.width / 2) * scaleX)}
          height={Math.max(3, (asset.height / 2) * scaleY)}
          rx="1"
          fill="rgba(248,113,113,.7)"
        />
      ))}
      {buildings.map((building) => (
        <rect
          key={building.id}
          x={building.x * scaleX}
          y={building.y * scaleY}
          width={Math.max(4, (building.size?.[0] ?? 4) * scaleX)}
          height={Math.max(4, (building.size?.[1] ?? 4) * scaleY)}
          rx="2"
          fill={building.type === "city-hall" ? "rgba(96,165,250,.95)" : "rgba(253,230,138,.88)"}
        />
      ))}
    </svg>
  );
}

function PreviewFrame({ previewDataUrl, snapshot }: { previewDataUrl: string; snapshot: LayoutSchemeSnapshot | null }) {
  if (previewDataUrl) {
    return (
      <img
        src={previewDataUrl}
        alt="布局真实预览"
        style={previewImageStyle}
      />
    );
  }
  return <MiniMap snapshot={snapshot} />;
}

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 240000,
  display: "grid",
  placeItems: "center",
  background: "rgba(2,6,23,.58)",
  backdropFilter: "blur(6px)",
};

const modalStyle: CSSProperties = {
  width: "min(1180px, calc(100vw - 48px))",
  maxHeight: "min(820px, calc(100dvh - 48px))",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  borderRadius: 18,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-glass)",
  color: "var(--ac-text)",
  overflow: "hidden",
  boxShadow: "0 28px 80px rgba(0,0,0,.55)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "22px 26px",
  borderBottom: "1px solid var(--ac-border)",
};

const eyebrowStyle: CSSProperties = {
  color: "var(--ac-kicker)",
  fontSize: 12,
  fontWeight: 950,
  letterSpacing: 2,
};

const titleStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 28,
};

const closeStyle: CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: 10,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface)",
  color: "var(--ac-text)",
  fontSize: 34,
  cursor: "pointer",
};

const contentStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 16,
  padding: 18,
  overflow: "auto",
};

const mutedStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "var(--ac-muted)",
  fontSize: 12,
  lineHeight: 1.45,
};

const schemeCardStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 14,
  borderRadius: 14,
  border: "1px solid var(--ac-border)",
  background: "rgba(2,6,23,.3)",
};

const cardTopStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
};

const cardTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
};

const activeBadgeStyle: CSSProperties = {
  alignSelf: "start",
  borderRadius: 999,
  padding: "3px 8px",
  color: "#1f2937",
  background: "var(--ac-kicker)",
  fontSize: 11,
  fontWeight: 950,
};

const previewStyle: CSSProperties = {
  width: "100%",
  minHeight: 132,
  aspectRatio: "520 / 300",
  borderRadius: 12,
  border: "1px solid var(--ac-border)",
};

const previewImageStyle: CSSProperties = {
  width: "100%",
  minHeight: 132,
  aspectRatio: "520 / 300",
  objectFit: "cover",
  display: "block",
  borderRadius: 12,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-glass)",
};

const emptyPreviewStyle: CSSProperties = {
  minHeight: 132,
  display: "grid",
  placeItems: "center",
  borderRadius: 12,
  border: "1px dashed var(--ac-border)",
  color: "var(--ac-muted)",
  background: "var(--ac-glass)",
  fontWeight: 900,
};

const cardActionsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
};

const smallBtnStyle: CSSProperties = {
  minHeight: 36,
  borderRadius: 9,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-control)",
  color: "var(--ac-text-soft)",
  fontWeight: 900,
  cursor: "pointer",
};
