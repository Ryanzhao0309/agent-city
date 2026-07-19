import type { CSSProperties } from "react";

const imageStyle: CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  borderRadius: "inherit",
  objectFit: "cover",
};

const fallbackStyle: CSSProperties = {
  display: "grid",
  width: "100%",
  height: "100%",
  placeItems: "center",
};

function isLocalSkillIcon(icon: string): boolean {
  return /^\/skill-icons\/[a-z0-9-]+\.(?:webp|png)$/i.test(icon);
}

export function SkillIcon({ icon }: { icon: string }) {
  if (isLocalSkillIcon(icon)) {
    return <img src={icon} alt="" aria-hidden="true" draggable={false} style={imageStyle} />;
  }

  return <span aria-hidden="true" style={fallbackStyle}>{icon || "🧩"}</span>;
}
