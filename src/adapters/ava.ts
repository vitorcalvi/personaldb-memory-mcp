import type { RecordRow, SearchResult } from '../types';

export interface AvaKnowledgeEntry {
  id: string; title: string; content: string; createdAt: string; updatedAt: string; version: number;
}

export function toAvaKnowledge(row: RecordRow | SearchResult): AvaKnowledgeEntry {
  const raw = 'metadata_json' in row ? row.metadata_json : JSON.stringify(row.metadata);
  let metadata: Record<string, unknown> = {};
  try { metadata = JSON.parse(raw) as Record<string, unknown>; } catch { /* no-op */ }
  return {
    id: row.id,
    title: typeof metadata.title === 'string' ? metadata.title : '',
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

export function avaUpsertInput(entry: AvaKnowledgeEntry, deviceId: string, vector?: number[]) {
  return {
    id: entry.id,
    type: 'business_knowledge',
    version: entry.version,
    device_id: deviceId,
    created_at: entry.createdAt,
    content: entry.content,
    metadata: { title: entry.title },
    vector,
  } as const;
}
