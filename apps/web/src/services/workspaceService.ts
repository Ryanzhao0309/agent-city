import { apiUrl } from "./api";

export interface WorkspaceFile {
  name: string;
  path: string;
  size: number;
  updatedAt: string;
}

export async function listWorkspaceFiles(agentId: string): Promise<WorkspaceFile[]> {
  const response = await fetch(apiUrl(`/api/agents/${encodeURIComponent(agentId)}/workspace`));
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Workspace list failed.");
  return Array.isArray(data?.files) ? data.files : [];
}

export async function uploadWorkspaceFile(agentId: string, file: File): Promise<WorkspaceFile> {
  const contentBase64 = await fileToBase64(file);
  const response = await fetch(apiUrl(`/api/agents/${encodeURIComponent(agentId)}/workspace/upload`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      contentBase64,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Workspace upload failed.");
  return data.file;
}

export async function exportTextToWorkspace(agentId: string, fileName: string, content: string): Promise<WorkspaceFile> {
  const encoded = btoa(unescape(encodeURIComponent(content)));
  const response = await fetch(apiUrl(`/api/agents/${encodeURIComponent(agentId)}/workspace/upload`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, contentBase64: encoded }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Workspace export failed.");
  return data.file;
}

export async function deleteWorkspaceFile(agentId: string, fileName: string): Promise<WorkspaceFile[]> {
  const response = await fetch(
    apiUrl(`/api/agents/${encodeURIComponent(agentId)}/workspace/${encodeURIComponent(fileName)}`),
    { method: "DELETE" }
  );
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Workspace delete failed.");
  return Array.isArray(data?.files) ? data.files : [];
}

export function workspaceDownloadUrl(agentId: string, fileName: string): string {
  return apiUrl(`/api/agents/${encodeURIComponent(agentId)}/workspace/download/${encodeURIComponent(fileName)}`);
}

export function workspacePreviewUrl(agentId: string, fileName: string): string {
  return `${workspaceDownloadUrl(agentId, fileName)}?inline=1`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",").pop() ?? "" : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
