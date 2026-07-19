import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db } from "./db.js";
import { extractReadableFile, listWorkingFiles } from "./workspaceAccess.js";
import { getWorkspaceFilePath, listWorkspaceFiles, readAgentConfig } from "./agentStore.js";

export interface CityKnowledgeDocument {
  id: string;
  title: string;
  fileName: string;
  content: string;
  agentIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeCitation {
  index: number;
  documentId: string;
  fileName: string;
  filePath: string;
  sectionPath: string;
  chunkId: string;
  excerpt: string;
}

function sections(text: string): Array<{ title: string; path: string; content: string }> {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const result: Array<{ title: string; path: string; content: string }> = [];
  let title = "正文";
  let body: string[] = [];
  const flush = () => {
    const content = body.join("\n").trim();
    if (content) result.push({ title, path: title, content });
    body = [];
  };
  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.+)$/) ?? line.match(/^(.{1,80})\n?$/);
    const explicit = Boolean(line.match(/^#{1,6}\s+/));
    if (explicit && heading) {
      flush();
      title = heading[1].trim();
    } else body.push(line);
  }
  flush();
  return result.length ? result : [{ title: "正文", path: "正文", content: text.trim() }];
}

function chunks(text: string, maxChars = 1600): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  const result: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maxChars) {
      result.push(current);
      current = "";
    }
    if (paragraph.length > maxChars) {
      if (current) result.push(current);
      current = "";
      for (let offset = 0; offset < paragraph.length; offset += maxChars) result.push(paragraph.slice(offset, offset + maxChars));
    } else current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current) result.push(current);
  return result;
}

function hashFile(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function normalizeMarkdownFileName(value: string): string {
  const base = path.basename(value.trim()).replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff ]+/g, "-").trim();
  if (!base || base === "." || base === "..") throw new Error("请输入有效的 Markdown 文件名。");
  return (base.toLowerCase().endsWith(".md") ? base : `${base}.md`).slice(0, 160);
}

function cityDocumentFromRow(row: Record<string, unknown>): CityKnowledgeDocument {
  const bindings = db.prepare("SELECT agent_id FROM agent_knowledge_binding WHERE document_id=? ORDER BY agent_id")
    .all(String(row.id)) as Array<{ agent_id: string }>;
  return {
    id: String(row.id),
    title: String(row.title),
    fileName: String(row.file_name),
    content: String(row.content),
    agentIds: bindings.map((binding) => binding.agent_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listCityKnowledgeDocuments(): CityKnowledgeDocument[] {
  const rows = db.prepare("SELECT * FROM city_knowledge_document ORDER BY updated_at DESC").all() as Array<Record<string, unknown>>;
  return rows.map(cityDocumentFromRow);
}

export function getCityKnowledgeDocument(documentId: string): CityKnowledgeDocument | null {
  const row = db.prepare("SELECT * FROM city_knowledge_document WHERE id=?").get(documentId) as Record<string, unknown> | undefined;
  return row ? cityDocumentFromRow(row) : null;
}

export async function createCityKnowledgeDocument(input: { title: string; fileName: string; content?: string; agentIds?: string[] }): Promise<CityKnowledgeDocument> {
  const title = input.title.trim();
  if (!title) throw new Error("知识文档标题不能为空。");
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const fileName = normalizeMarkdownFileName(input.fileName || title);
  db.prepare(`INSERT INTO city_knowledge_document (id, title, file_name, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(id, title, fileName, input.content ?? `# ${title}\n`, timestamp, timestamp);
  await setCityKnowledgeAssignments(id, input.agentIds ?? []);
  return getCityKnowledgeDocument(id)!;
}

export async function updateCityKnowledgeDocument(documentId: string, input: { title?: string; fileName?: string; content?: string }): Promise<CityKnowledgeDocument> {
  const current = getCityKnowledgeDocument(documentId);
  if (!current) throw new Error("知识文档不存在。");
  const title = input.title === undefined ? current.title : input.title.trim();
  if (!title) throw new Error("知识文档标题不能为空。");
  const fileName = input.fileName === undefined ? current.fileName : normalizeMarkdownFileName(input.fileName);
  db.prepare(`UPDATE city_knowledge_document SET title=?, file_name=?, content=?, updated_at=? WHERE id=?`)
    .run(title, fileName, input.content ?? current.content, new Date().toISOString(), documentId);
  for (const agentId of current.agentIds) await reindexAgentKnowledge(agentId);
  return getCityKnowledgeDocument(documentId)!;
}

export async function setCityKnowledgeAssignments(documentId: string, agentIds: string[]): Promise<CityKnowledgeDocument> {
  const current = getCityKnowledgeDocument(documentId);
  if (!current) throw new Error("知识文档不存在。");
  const nextAgentIds = [...new Set(agentIds.map((id) => id.trim()).filter(Boolean))];
  const affected = [...new Set([...current.agentIds, ...nextAgentIds])];
  const timestamp = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM agent_knowledge_binding WHERE document_id=?").run(documentId);
    const insert = db.prepare("INSERT INTO agent_knowledge_binding (agent_id, document_id, created_at) VALUES (?, ?, ?)");
    for (const agentId of nextAgentIds) insert.run(agentId, documentId, timestamp);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  for (const agentId of affected) {
    if (readAgentConfig(agentId)) await reindexAgentKnowledge(agentId);
  }
  return getCityKnowledgeDocument(documentId)!;
}

export async function deleteCityKnowledgeDocument(documentId: string): Promise<boolean> {
  const current = getCityKnowledgeDocument(documentId);
  if (!current) return false;
  db.prepare("DELETE FROM agent_knowledge_binding WHERE document_id=?").run(documentId);
  db.prepare("DELETE FROM city_knowledge_document WHERE id=?").run(documentId);
  for (const agentId of current.agentIds) if (readAgentConfig(agentId)) await reindexAgentKnowledge(agentId);
  return true;
}

export function listAgentCityKnowledge(agentId: string): CityKnowledgeDocument[] {
  const rows = db.prepare(`SELECT d.* FROM city_knowledge_document d
    JOIN agent_knowledge_binding b ON b.document_id=d.id
    WHERE b.agent_id=? ORDER BY d.updated_at DESC`).all(agentId) as Array<Record<string, unknown>>;
  return rows.map(cityDocumentFromRow);
}

export function agentHasCityKnowledge(agentId: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM agent_knowledge_binding WHERE agent_id=? LIMIT 1").get(agentId));
}

function hasFts(): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_chunk_fts'").get();
  return Boolean(row);
}

function deleteDocument(documentId: string): void {
  if (hasFts()) db.prepare("DELETE FROM knowledge_chunk_fts WHERE chunk_id IN (SELECT id FROM knowledge_chunk WHERE document_id=?)").run(documentId);
  db.prepare("DELETE FROM knowledge_chunk WHERE document_id=?").run(documentId);
  db.prepare("DELETE FROM knowledge_section WHERE document_id=?").run(documentId);
  db.prepare("DELETE FROM knowledge_document WHERE id=?").run(documentId);
}

export async function reindexAgentKnowledge(agentId: string): Promise<{ indexed: number; skipped: number; errors: string[] }> {
  const config = readAgentConfig(agentId);
  if (!config) throw new Error("Agent 配置不存在。");
  const privateEntries = listWorkspaceFiles(agentId).map((entry) => ({
    key: `private:${entry.name}`, name: entry.name, size: entry.size, absolutePath: getWorkspaceFilePath(agentId, entry.name), source: "private",
  }));
  const workingEntries = config.workspaceRoot && config.permissions?.workspace !== "none"
    ? listWorkingFiles(config).filter((entry) => entry.kind === "file").map((entry) => ({
      key: `working:${entry.path}`, name: entry.name, size: entry.size, absolutePath: path.resolve(config.workspaceRoot!, entry.path), source: "working",
    }))
    : [];
  const cityEntries = listAgentCityKnowledge(agentId).map((document) => ({
    key: `city:${document.id}`,
    name: document.fileName,
    size: Buffer.byteLength(document.content),
    content: document.content,
    source: "city",
  }));
  const entries = [...cityEntries, ...privateEntries, ...workingEntries];
  const seen = new Set<string>();
  let indexed = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const entry of entries) {
    seen.add(entry.key);
    try {
      const contentHash = "content" in entry ? hashContent(entry.content) : hashFile(entry.absolutePath);
      const existing = db.prepare("SELECT id, content_hash FROM knowledge_document WHERE agent_id=? AND file_path=?")
        .get(agentId, entry.key) as { id: string; content_hash: string } | undefined;
      if (existing?.content_hash === contentHash) {
        skipped += 1;
        continue;
      }
      if (existing) deleteDocument(existing.id);
      const file = "content" in entry
        ? { content: entry.content, truncated: false }
        : await extractReadableFile(entry.absolutePath);
      const documentId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      db.prepare(`INSERT INTO knowledge_document
        (id, agent_id, file_name, file_path, content_hash, status, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'ready', ?, ?, ?)`).run(
        documentId, agentId, entry.name, entry.key, contentHash,
        JSON.stringify({ truncated: file.truncated, size: entry.size, source: entry.source }), timestamp, timestamp,
      );
      let chunkOrdinal = 0;
      for (const [sectionOrdinal, section] of sections(file.content).entries()) {
        const sectionId = crypto.randomUUID();
        db.prepare(`INSERT INTO knowledge_section
          (id, document_id, parent_id, title, path, ordinal, summary) VALUES (?, ?, NULL, ?, ?, ?, ?)`)
          .run(sectionId, documentId, section.title, section.path, sectionOrdinal, section.content.slice(0, 300));
        for (const content of chunks(section.content)) {
          const chunkId = crypto.randomUUID();
          db.prepare(`INSERT INTO knowledge_chunk
            (id, document_id, section_id, ordinal, section_path, content) VALUES (?, ?, ?, ?, ?, ?)`)
            .run(chunkId, documentId, sectionId, chunkOrdinal++, section.path, content);
          if (hasFts()) db.prepare(`INSERT INTO knowledge_chunk_fts
            (chunk_id, agent_id, file_name, section_path, content) VALUES (?, ?, ?, ?, ?)`)
            .run(chunkId, agentId, entry.name, section.path, content);
        }
      }
      indexed += 1;
    } catch (error) {
      errors.push(`${entry.key}: ${error instanceof Error ? error.message : "索引失败"}`);
    }
  }
  const existing = db.prepare("SELECT id, file_path FROM knowledge_document WHERE agent_id=?").all(agentId) as Array<{ id: string; file_path: string }>;
  for (const row of existing) if (!seen.has(row.file_path)) deleteDocument(row.id);
  return { indexed, skipped, errors };
}

function ftsQuery(query: string): string {
  const terms = query.toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) ?? [];
  return [...new Set(terms)].slice(0, 10).map((term) => `"${term.replace(/"/g, "")}"`).join(" OR ");
}

export function searchKnowledge(agentId: string, query: string, limit = 6): KnowledgeCitation[] {
  const needle = query.trim();
  if (!needle) return [];
  let rows: Array<Record<string, unknown>> = [];
  const match = ftsQuery(needle);
  if (hasFts() && match) {
    try {
      rows = db.prepare(`SELECT f.chunk_id, f.file_name, f.section_path, f.content,
        d.id AS document_id, d.file_path, bm25(knowledge_chunk_fts) AS score
        FROM knowledge_chunk_fts f JOIN knowledge_chunk c ON c.id=f.chunk_id
        JOIN knowledge_document d ON d.id=c.document_id
        WHERE knowledge_chunk_fts MATCH ? AND f.agent_id=? ORDER BY score LIMIT ?`)
        .all(match, agentId, Math.min(limit, 12)) as Array<Record<string, unknown>>;
    } catch {
      rows = [];
    }
  }
  if (!rows.length) {
    const fallbackTerms = [...new Set(
      needle.toLowerCase().match(/[a-z0-9_-]{2,}|[\u3400-\u9fff]{2,}/g) ?? [needle.toLowerCase().slice(0, 120)],
    )].slice(0, 10);
    const clauses = fallbackTerms.flatMap(() => ["lower(c.content) LIKE ?", "lower(d.file_name) LIKE ?"]);
    const params = fallbackTerms.flatMap((term) => [`%${term}%`, `%${term}%`]);
    rows = db.prepare(`SELECT c.id AS chunk_id, d.file_name, c.section_path, c.content,
      d.id AS document_id, d.file_path FROM knowledge_chunk c
      JOIN knowledge_document d ON d.id=c.document_id
      WHERE d.agent_id=? AND (${clauses.join(" OR ")}) LIMIT ?`)
      .all(agentId, ...params, Math.min(limit, 12)) as Array<Record<string, unknown>>;
  }
  return rows.map((row, index) => ({
    index: index + 1,
    documentId: String(row.document_id),
    fileName: String(row.file_name),
    filePath: String(row.file_path),
    sectionPath: String(row.section_path),
    chunkId: String(row.chunk_id),
    excerpt: String(row.content).slice(0, 900),
  }));
}
