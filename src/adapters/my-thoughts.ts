import type { RecordRow, SearchResult } from '../types';

export interface MyThoughtsMemory {
  id: string; content: string; context: string; source: string;
  importance: number; confidence: number; tags: string[];
  created_at: number; updated_at: number; rank?: number;
}

function metadata(value: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
}

export function toMyThoughtsMemory(row: RecordRow | SearchResult): MyThoughtsMemory {
  const m = 'metadata_json' in row ? metadata(row.metadata_json) : row.metadata;
  return {
    id: row.id,
    content: row.content,
    context: typeof m.context === 'string' ? m.context : 'general',
    source: typeof m.source === 'string' ? m.source : 'unknown',
    importance: typeof m.importance === 'number' ? m.importance : 5,
    confidence: typeof m.confidence === 'number' ? m.confidence : 1,
    tags: Array.isArray(m.tags) ? m.tags.filter((x): x is string => typeof x === 'string') : [],
    created_at: Date.parse(row.created_at) / 1000,
    updated_at: Date.parse(row.updated_at) / 1000,
    ...('score' in row ? { rank: row.score } : {})
  };
}
