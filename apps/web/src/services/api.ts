const DESKTOP_API_ORIGIN = "http://127.0.0.1:34127";

function isTauriDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${isTauriDesktop() ? DESKTOP_API_ORIGIN : ""}${normalized}`;
}
