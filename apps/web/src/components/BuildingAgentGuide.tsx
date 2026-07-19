import type { NpcDefinition } from "../types";

export function BuildingAgentGuide({
  resident,
  name,
  role,
  spriteUrl,
  accent,
  message,
  onChat,
  onConfigure,
  onChange,
}: {
  resident: NpcDefinition | null;
  name: string;
  role: string;
  spriteUrl: string;
  accent: string;
  message: string;
  onChat?: () => void;
  onConfigure?: () => void;
  onChange?: () => void;
}) {
  return (
    <section style={guideStyle}>
      <div style={{ ...avatarStyle, borderColor: `${accent}88`, background: `${accent}24` }}>
        <img src={spriteUrl} alt={name} draggable={false} style={avatarImageStyle} />
      </div>
      <div style={bubbleStyle}>
        <div style={bubbleMetaStyle}>
          <span style={{ color: accent }}>{resident ? name : "未分配 Agent"}</span>
          <span>{role}</span>
        </div>
        <p style={bubbleTextStyle}>{message}</p>
        <div style={actionsStyle}>
          {onChat && (
            <button style={primaryBtnStyle} onClick={onChat}>
              对话
            </button>
          )}
          {onConfigure && (
            <button style={secondaryBtnStyle} onClick={onConfigure}>
              AI Brain
            </button>
          )}
          {onChange && (
            <button style={secondaryBtnStyle} onClick={onChange}>
              更换 Agent
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

const guideStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "54px minmax(0, 1fr)",
  gap: 10,
  alignItems: "end",
  marginBottom: 12,
};

const avatarStyle: React.CSSProperties = {
  width: 54,
  height: 62,
  borderRadius: 8,
  border: "1px solid",
  overflow: "hidden",
  imageRendering: "pixelated",
};

const avatarImageStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  objectPosition: "center bottom",
  imageRendering: "pixelated",
};

const bubbleStyle: React.CSSProperties = {
  position: "relative",
  borderRadius: 8,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-raised)",
  color: "var(--ac-text)",
  padding: "9px 10px",
};

const bubbleMetaStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  fontSize: 10,
  fontWeight: 900,
  color: "var(--ac-muted)",
  marginBottom: 5,
};

const bubbleTextStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--ac-text-soft)",
  fontSize: 12,
  lineHeight: 1.45,
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 7,
  flexWrap: "wrap",
  marginTop: 9,
};

const primaryBtnStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "none",
  background: "#60a5fa",
  color: "var(--ac-field)",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 900,
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-raised)",
  color: "var(--ac-text)",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 900,
};
