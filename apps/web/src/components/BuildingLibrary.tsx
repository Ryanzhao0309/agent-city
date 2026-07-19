import { useEffect, useRef, useState } from "react";
import { useCityStore } from "../store/cityStore";
import type { CustomAssetKind, CustomSceneAsset } from "../types";
import { filterAvailableProjectAssets, getAvailableProjectAssets } from "../data/localAssets";
import { apiUrl } from "../services/api";

type AssetLibraryTab = "terrain" | "decoration" | "building";

const ASSET_TAB_LABELS: Record<AssetLibraryTab, string> = {
  terrain: "地砖地形",
  decoration: "树木绿植",
  building: "建筑",
};

function assetGroupHint(tab: AssetLibraryTab): string {
  if (tab === "terrain") return "/ground/walkable/tileable/* · 1×1 可拼接地形";
  if (tab === "decoration") return "/decorations/blocking/* · 阻挡素材";
  return "/buildings/megalithic-single-pack/* · 真建筑";
}

function isLibraryAssetForTab(asset: CustomSceneAsset, tab: AssetLibraryTab) {
  if (asset.source === "upload" || asset.url.startsWith("data:")) {
    return asset.kind === tab;
  }
  if (tab === "terrain") return asset.kind === "terrain" && asset.url.includes("/ground/walkable/tileable/");
  if (tab === "decoration") return asset.kind === "decoration" && asset.url.includes("/decorations/blocking/");
  return asset.kind === "building" && asset.url.includes("/buildings/");
}

function readAssetFile(file: File, kind: CustomAssetKind): Promise<CustomSceneAsset> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        id: `upload-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind,
        name: file.name.replace(/\.[^.]+$/, ""),
        url: String(reader.result),
        source: "upload",
      });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function AssetUploadButton({
  label,
  hint,
  kind,
  onUpload,
}: {
  label: string;
  hint: string;
  kind: CustomAssetKind;
  onUpload: (asset: CustomSceneAsset) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const showLaunchToast = useCityStore((s) => s.showLaunchToast);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/webp"].includes(file.type)) {
      showLaunchToast("请上传 PNG 或 WebP 素材。");
      return;
    }
    const asset = await readAssetFile(file, kind);
    onUpload(asset);
    showLaunchToast(`${asset.name} 已加入素材库。`);
  }

  return (
    <>
      <button style={uploadBtnStyle} title={hint} onClick={() => inputRef.current?.click()}>
        +
      </button>
      <input ref={inputRef} type="file" accept="image/png,image/webp" style={{ display: "none" }} onChange={handleFile} />
      <span style={uploadHintStyle}>{label}</span>
    </>
  );
}

export function AssetLibraryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const buildMode = useCityStore((s) => s.buildMode);
  const customAssets = useCityStore((s) => s.customAssets);
  const installedThemePacks = useCityStore((s) => s.installedThemePacks);
  const activeCustomAssetId = useCityStore((s) => s.activeCustomAssetId);
  const upsertCustomAssets = useCityStore((s) => s.upsertCustomAssets);
  const selectCustomAsset = useCityStore((s) => s.selectCustomAsset);
  const showLaunchToast = useCityStore((s) => s.showLaunchToast);
  const [tab, setTab] = useState<AssetLibraryTab>("terrain");

  useEffect(() => {
    if (!open) return;
    upsertCustomAssets(getAvailableProjectAssets(installedThemePacks));
    let cancelled = false;
    fetch(apiUrl("/api/assets"))
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !Array.isArray(data?.assets)) return;
        upsertCustomAssets(filterAvailableProjectAssets(data.assets as CustomSceneAsset[], installedThemePacks));
      })
      .catch(() => {
        if (!cancelled) showLaunchToast("项目素材扫描失败，请确认后端服务正在运行。");
      });
    return () => {
      cancelled = true;
    };
  }, [installedThemePacks, open, showLaunchToast, upsertCustomAssets]);

  if (!open) return null;

  const availableCustomAssets = filterAvailableProjectAssets(customAssets, installedThemePacks);
  const visibleAssets = availableCustomAssets.filter((asset) => isLibraryAssetForTab(asset, tab));
  const uploadKind: CustomAssetKind =
    tab === "terrain" ? "terrain" : tab === "decoration" ? "decoration" : "building";

  function choose(asset: CustomSceneAsset) {
    if (!buildMode) {
      showLaunchToast("请先打开 Build Mode，再摆放素材。");
      return;
    }
    selectCustomAsset(activeCustomAssetId === asset.id ? null : asset.id);
    showLaunchToast(`${asset.name} 已选中，点击地图即可摆放。`);
    onClose();
  }

  return (
    <div style={modalBackdropStyle} onMouseDown={onClose}>
      <div data-ui-surface="panel" style={assetModalStyle} onMouseDown={(event) => event.stopPropagation()}>
        <div style={assetModalHeaderStyle}>
          <div>
            <div style={assetModalEyebrowStyle}>素材库</div>
            <div style={assetModalTitleStyle}>斜视角贴花与建筑素材</div>
          </div>
          <button style={modalCloseStyle} onClick={onClose}>
            ×
          </button>
        </div>

        <div style={assetTabsStyle}>
          {(Object.keys(ASSET_TAB_LABELS) as AssetLibraryTab[]).map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                ...assetTabStyle,
                background: tab === key ? "#60a5fa" : "var(--ac-surface-raised)",
                color: tab === key ? "#07111f" : "var(--ac-text-soft)",
                borderColor: tab === key ? "var(--ac-accent-text)" : "var(--ac-border)",
              }}
            >
              {ASSET_TAB_LABELS[key]}
            </button>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <AssetUploadButton
              label={tab === "building" ? "PNG/WebP, 512×512" : "PNG/WebP, 透明贴花"}
              hint={
                tab === "building"
                  ? "上传建筑素材：推荐透明背景 PNG/WebP，默认按 2×2 真建筑摆放。"
                  : tab === "terrain"
                  ? "上传地形贴花：推荐透明 PNG/WebP，边缘柔和，人物可以走上去。"
                  : "上传绿植/石头：推荐透明 PNG/WebP，会阻挡人物行走。"
              }
              kind={uploadKind}
              onUpload={(asset) => upsertCustomAssets([asset])}
            />
          </div>
        </div>

        <div style={assetModalHintStyle}>{assetGroupHint(tab)}</div>

        <div style={assetGridStyle}>
          {visibleAssets.map((asset) => (
            <button
              key={asset.id}
              style={{
                ...assetCardStyle,
                borderColor:
                  activeCustomAssetId === asset.id ? "var(--ac-kicker)" : "var(--ac-border)",
              }}
              title={asset.name}
              onClick={() => choose(asset)}
            >
              <div style={assetThumbWrapStyle}>
                <img src={asset.url} alt={asset.name} loading="lazy" decoding="async" draggable={false} style={assetThumbStyle} />
              </div>
              <div style={assetCardNameStyle}>{asset.name}</div>
              <div style={assetCardMetaStyle}>
                {tab === "terrain" ? "1×1 可拼接" : tab === "decoration" ? "1×1 阻挡" : "2×2 真建筑"}
              </div>
            </button>
          ))}
          {!visibleAssets.length && (
            <div style={emptyAssetsStyle}>
              这个分组暂时没有素材。把 PNG/WebP 放到 {assetGroupHint(tab).split(" · ")[0]} 后，重新打开素材库即可扫描。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const uploadBtnStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 6,
  border: "1px solid rgba(147,197,253,0.38)",
  background: "var(--ac-surface-raised)",
  color: "var(--ac-accent-text)",
  cursor: "pointer",
  fontSize: 17,
  fontWeight: 900,
  lineHeight: "20px",
};

const uploadHintStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 8,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const modalBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 240000,
  background: "var(--ac-backdrop)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const assetModalStyle: React.CSSProperties = {
  width: "min(960px, 94vw)",
  maxHeight: "86vh",
  overflow: "hidden",
  borderRadius: 18,
  border: "1px solid var(--ac-border)",
  background: "linear-gradient(180deg, var(--ac-surface-raised), var(--ac-surface))",
  boxShadow: "0 28px 80px rgba(0,0,0,0.42)",
  display: "flex",
  flexDirection: "column",
};

const assetModalHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "18px 22px",
  borderBottom: "1px solid var(--ac-border)",
};

const assetModalEyebrowStyle: React.CSSProperties = {
  color: "#facc15",
  fontSize: 12,
  fontWeight: 950,
  letterSpacing: 3,
};

const assetModalTitleStyle: React.CSSProperties = {
  color: "var(--ac-text)",
  fontSize: 24,
  fontWeight: 950,
  marginTop: 4,
};

const modalCloseStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 10,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface)",
  color: "var(--ac-text)",
  cursor: "pointer",
  fontSize: 26,
  fontWeight: 900,
  lineHeight: "30px",
};

const assetTabsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "14px 22px 8px",
  flexWrap: "wrap",
};

const assetTabStyle: React.CSSProperties = {
  borderRadius: 999,
  border: "1px solid var(--ac-border)",
  padding: "8px 14px",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 950,
};

const assetModalHintStyle: React.CSSProperties = {
  color: "var(--ac-muted)",
  fontSize: 12,
  padding: "0 22px 12px",
  fontWeight: 800,
};

const assetGridStyle: React.CSSProperties = {
  padding: "0 22px 22px",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
  gap: 12,
  overflowY: "auto",
};

const assetCardStyle: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-glass)",
  padding: 10,
  cursor: "pointer",
  textAlign: "left",
  color: "var(--ac-text)",
};

const assetThumbWrapStyle: React.CSSProperties = {
  height: 104,
  borderRadius: 12,
  background:
    "linear-gradient(135deg, var(--ac-glass), var(--ac-control)), radial-gradient(circle at 50% 80%, rgba(132,204,22,0.16), transparent 42%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};

const assetThumbStyle: React.CSSProperties = {
  maxWidth: "100%",
  maxHeight: "100%",
  objectFit: "contain",
  objectPosition: "center bottom",
  filter: "drop-shadow(-6px 10px 7px rgba(0,0,0,0.28))",
};

const assetCardNameStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  fontWeight: 950,
  color: "var(--ac-text)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const assetCardMetaStyle: React.CSSProperties = {
  marginTop: 3,
  fontSize: 10,
  color: "var(--ac-accent-text)",
  fontWeight: 900,
};

const emptyAssetsStyle: React.CSSProperties = {
  gridColumn: "1 / -1",
  padding: 18,
  borderRadius: 12,
  border: "1px dashed var(--ac-border)",
  color: "var(--ac-muted)",
  fontSize: 13,
  lineHeight: 1.6,
};
