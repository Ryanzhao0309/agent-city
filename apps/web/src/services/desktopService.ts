import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";

export function isTauriDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function selectWorkingDirectory(): Promise<string | null> {
  if (!isTauriDesktop()) throw new Error("本地工作文件夹只能在 Agent City 桌面版中选择。");
  const selected = await open({ directory: true, multiple: false, title: "选择 Agent 工作文件夹" });
  return typeof selected === "string" ? selected : null;
}

export async function openExternalUrl(url: string): Promise<void> {
  if (isTauriDesktop()) {
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
