export interface Env {
  DB: D1Database;
  VECTORIZE?: VectorizeIndex;
  AUTH_HMAC_SECRET: string;
  EMBEDDING_DIMENSIONS?: string;
  RRF_K?: string;
}

export interface AuthContext { userId: string }

export interface ChunkInput {
  id?: string;
  content: string;
  vector?: number[];
}

export interface UpsertInput {
  id?: string;
  type: string;
  version?: number;
  device_id: string;
  created_at?: string;
  content_hash?: string;
  content: string;
  metadata?: Record<string, unknown>;
  vector?: number[];
  chunks?: ChunkInput[];
}

export interface RecordRow {
  id: string;
  user_id: string;
  record_type: string;
  version: number;
  device_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  content_hash: string;
  content: string;
  metadata_json: string;
}

export interface SearchInput {
  query: string;
  vector?: number[];
  top_k?: number;
  type?: string;
  context?: string;
}

export interface SearchResult {
  id: string;
  type: string;
  content: string;
  metadata: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
  content_hash: string;
  score: number;
  lexical_rank?: number;
  vector_rank?: number;
}
