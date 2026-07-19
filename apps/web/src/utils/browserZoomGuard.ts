const MAX_BROWSER_ZOOM = 2.25;
const BASELINE_STORAGE_KEY = "agent-city-browser-zoom-baseline";

function viewportRatio(): number {
  if (window.outerWidth <= 0 || window.innerWidth <= 0) return 1;
  return window.outerWidth / window.innerWidth;
}

function readBaseline(): number {
  const current = viewportRatio();
  const inferredBaseline = current <= 1.25 ? current : 1;
  try {
    const saved = Number.parseFloat(window.sessionStorage.getItem(BASELINE_STORAGE_KEY) ?? "");
    if (Number.isFinite(saved) && saved > 0 && saved <= 1.25) return saved;
    window.sessionStorage.setItem(BASELINE_STORAGE_KEY, String(inferredBaseline));
  } catch {
    // Zoom limiting is optional when session storage is unavailable.
  }
  return inferredBaseline;
}

export function installBrowserZoomGuard(): () => void {
  const baseline = readBaseline();
  const atMaximumZoom = () => viewportRatio() / baseline >= MAX_BROWSER_ZOOM - 0.03;

  const handleKeyDown = (event: KeyboardEvent) => {
    const zoomInKey = event.key === "+" || event.key === "=" || event.code === "NumpadAdd";
    if ((event.ctrlKey || event.metaKey) && zoomInKey && atMaximumZoom()) {
      event.preventDefault();
    }
  };

  const handleWheel = (event: WheelEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.deltaY < 0 && atMaximumZoom()) {
      event.preventDefault();
    }
  };

  window.addEventListener("keydown", handleKeyDown, { capture: true });
  window.addEventListener("wheel", handleWheel, { capture: true, passive: false });

  return () => {
    window.removeEventListener("keydown", handleKeyDown, { capture: true });
    window.removeEventListener("wheel", handleWheel, { capture: true });
  };
}
