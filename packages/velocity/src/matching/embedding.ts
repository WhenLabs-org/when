// Semantic embeddings for task descriptions. Wraps @huggingface/transformers
// in a testable interface so unit tests can inject a stub without paying the
// model-load cost (or the ~25 MB model download on first run).

export const DEFAULT_EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIM = 384;

export interface Embedder {
  readonly modelName: string;
  embed(text: string): Promise<Float32Array>;
}

// --- Serialization ----------------------------------------------------------

/**
 * Pack a Float32Array into a Buffer suitable for SQLite BLOB storage.
 * Copies bytes so the buffer is independent of the source array's backing.
 */
export function vectorToBuffer(vec: Float32Array): Buffer {
  const buf = Buffer.allocUnsafe(vec.byteLength);
  const view = new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
  buf.set(view);
  return buf;
}

export function bufferToVector(buf: Buffer | Uint8Array): Float32Array {
  // Copy into a fresh aligned ArrayBuffer — Buffer slices can be mis-aligned
  // for Float32 (4-byte) views.
  const u8 = new Uint8Array(buf.byteLength);
  u8.set(buf);
  return new Float32Array(u8.buffer);
}

// --- Cosine similarity ------------------------------------------------------

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// --- Lazy-loaded real embedder ----------------------------------------------

let pipelinePromise: Promise<unknown> | null = null;
let disabled = false;

/**
 * Load the feature-extraction pipeline once and cache the promise. Errors
 * (missing native deps, download failures, offline) flip the embedder off
 * permanently — callers degrade to Jaccard similarity instead.
 */
async function loadPipeline(modelName: string): Promise<unknown | null> {
  if (disabled) return null;
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const mod = await import('@huggingface/transformers');
      // Pool + normalize on the CPU backend so we get a unit-norm 384-vector
      // out of the box.
      return mod.pipeline('feature-extraction', modelName);
    })().catch((err) => {
      disabled = true;
      process.stderr.write(`velocity-mcp: embedding model unavailable (${(err as Error).message}); falling back to Jaccard\n`);
      return null;
    });
  }
  return pipelinePromise;
}

class RealEmbedder implements Embedder {
  constructor(public readonly modelName: string = DEFAULT_EMBEDDING_MODEL) {}
  async embed(text: string): Promise<Float32Array> {
    const pipe = await loadPipeline(this.modelName);
    if (!pipe) throw new Error('embedder unavailable');
    // The pipeline returns a Tensor with a .data Float32Array.
    // Using pooling='mean' + normalize=true gives a unit-norm sentence vector.
    const output = await (pipe as (input: string, opts: Record<string, unknown>) => Promise<{ data: Float32Array }>)(
      text,
      { pooling: 'mean', normalize: true },
    );
    // Ensure we return a plain Float32Array (copy off the backing tensor).
    return new Float32Array(output.data);
  }
}

let defaultEmbedder: Embedder | null = null;

export function getDefaultEmbedder(): Embedder {
  if (!defaultEmbedder) defaultEmbedder = new RealEmbedder();
  return defaultEmbedder;
}

/** Expose for tests to short-circuit the heavy dependency. */
export function setDefaultEmbedder(embedder: Embedder | null): void {
  defaultEmbedder = embedder;
}

// --- Convenience: build text to embed from a task row ----------------------

export function taskEmbeddingText(description: string, tags: string[]): string {
  return tags.length > 0 ? `${description} [tags: ${tags.join(', ')}]` : description;
}

/** Best-effort embed: returns null on failure (model not available, bad text). */
export async function tryEmbed(embedder: Embedder, text: string): Promise<Float32Array | null> {
  try {
    if (!text.trim()) return null;
    const vec = await embedder.embed(text);
    if (!vec || vec.length === 0) return null;
    return vec;
  } catch {
    return null;
  }
}

// --- Backfill ---------------------------------------------------------------

export const BACKFILL_TRIGGER_THRESHOLD = 100;
export const BACKFILL_BATCH_LIMIT = 500;

export interface BackfillQueries {
  countTasksMissingEmbedding(): number;
  getTasksMissingEmbedding(limit: number): Array<{
    id: string;
    description: string;
    tags: string;
  }>;
  setEmbedding(id: string, embedding: Buffer, modelName: string): void;
}

export interface BackfillResult {
  attempted: number;
  succeeded: number;
  failed: number;
}

/**
 * Backfill embeddings for historical completed tasks that don't have one yet.
 * Runs sequentially — ONNX inference is CPU-bound and parallelism hurts more
 * than it helps on the default backend.
 */
export async function backfillEmbeddings(
  queries: BackfillQueries,
  embedder: Embedder,
  limit: number = BACKFILL_BATCH_LIMIT,
): Promise<BackfillResult> {
  const rows = queries.getTasksMissingEmbedding(limit);
  let succeeded = 0;
  let failed = 0;
  for (const row of rows) {
    let tags: string[] = [];
    try { tags = JSON.parse(row.tags || '[]') as string[]; } catch { /* ignore */ }
    const vec = await tryEmbed(embedder, taskEmbeddingText(row.description, tags));
    if (vec) {
      try {
        queries.setEmbedding(row.id, vectorToBuffer(vec), embedder.modelName);
        succeeded++;
      } catch {
        failed++;
      }
    } else {
      failed++;
    }
  }
  return { attempted: rows.length, succeeded, failed };
}
