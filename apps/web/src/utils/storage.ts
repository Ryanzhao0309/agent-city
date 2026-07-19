import type { CityLayout } from "../types";
import { apiUrl } from "../services/api";

const LOCAL_KEY = "agent-city-layout";

function isTauriDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Try the self-hosted API first; fall back to localStorage if the server isn't reachable
 * (e.g. running the web build standalone without apps/server). */
export async function loadLayout(): Promise<CityLayout | null> {
  // The desktop WebView can become ready a moment before its local sidecar.
  // Retry there so a transient startup race does not permanently show an
  // empty localStorage city for the entire session.
  const attempts = isTauriDesktop() ? 12 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(apiUrl("/api/city"));
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Server not reachable yet; desktop retries briefly below.
    }
    if (attempt + 1 < attempts) {
      await delay(250);
    }
  }
  const raw = localStorage.getItem(LOCAL_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function saveLayout(layout: CityLayout): Promise<"server" | "local"> {
  try {
    const res = await fetch(apiUrl("/api/city"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(layout),
    });
    if (res.ok) {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(layout));
      return "server";
    }
  } catch {
    // server not reachable
  }
  localStorage.setItem(LOCAL_KEY, JSON.stringify(layout));
  return "local";
}

export function exportLayout(layout: CityLayout) {
  const blob = new Blob([JSON.stringify(layout, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "agent-city-layout.json";
  a.click();
  URL.revokeObjectURL(url);
}

export function importLayout(file: File): Promise<CityLayout> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result as string));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
