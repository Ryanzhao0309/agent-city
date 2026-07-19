import { apiUrl } from "./api";

export interface KnowledgeDocument {
  id: string;
  title: string;
  fileName: string;
  content: string;
  agentIds: string[];
  createdAt: string;
  updatedAt: string;
}

async function jsonResult<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "知识库请求失败。");
  return data as T;
}

export async function listKnowledgeDocuments(): Promise<KnowledgeDocument[]> {
  const data = await jsonResult<{ documents: KnowledgeDocument[] }>(await fetch(apiUrl("/api/knowledge-documents")));
  return data.documents;
}

export async function createKnowledgeDocument(input: Pick<KnowledgeDocument, "title" | "fileName" | "content" | "agentIds">): Promise<KnowledgeDocument> {
  const data = await jsonResult<{ document: KnowledgeDocument }>(await fetch(apiUrl("/api/knowledge-documents"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
  return data.document;
}

export async function saveKnowledgeDocument(documentId: string, input: Pick<KnowledgeDocument, "title" | "fileName" | "content">): Promise<KnowledgeDocument> {
  const data = await jsonResult<{ document: KnowledgeDocument }>(await fetch(apiUrl(`/api/knowledge-documents/${encodeURIComponent(documentId)}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
  return data.document;
}

export async function assignKnowledgeDocument(documentId: string, agentIds: string[]): Promise<KnowledgeDocument> {
  const data = await jsonResult<{ document: KnowledgeDocument }>(await fetch(apiUrl(`/api/knowledge-documents/${encodeURIComponent(documentId)}/agents`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentIds }),
  }));
  return data.document;
}

export async function deleteKnowledgeDocument(documentId: string): Promise<void> {
  await jsonResult(await fetch(apiUrl(`/api/knowledge-documents/${encodeURIComponent(documentId)}`), { method: "DELETE" }));
}

export async function listAgentKnowledgeDocuments(agentId: string): Promise<KnowledgeDocument[]> {
  const data = await jsonResult<{ documents: KnowledgeDocument[] }>(await fetch(apiUrl(`/api/agents/${encodeURIComponent(agentId)}/city-knowledge`)));
  return data.documents;
}
