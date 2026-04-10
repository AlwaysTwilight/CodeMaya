import path from "node:path";
import { env } from "../config/env.js";
import { sha256Hex } from "../utils/crypto.js";
import { getChromaCollection } from "./chroma.js";
import { semanticChunkMarkdown } from "./chunking.js";

type ChunkRecord = {
  id: string;
  text: string;
  metadata: {
    sourcePath: string;
    sourceTitle: string;
    chunkIndex: number;
    contentHash: string;
  };
};

function titleFromPath(p: string) {
  const base = path.basename(p);
  return base.replace(/\.[^.]+$/, "");
}

function toChunkRecords(sourcePath: string, docs: { pageContent?: string }[]) {
  const sourceTitle = titleFromPath(sourcePath);
  const records: ChunkRecord[] = [];
  for (let idx = 0; idx < docs.length; idx++) {
    const text = (docs[idx]?.pageContent ?? "").trim();
    if (!text) continue;
    const contentHash = sha256Hex(text);
    const id = sha256Hex(`${sourcePath}::${contentHash}`);
    records.push({
      id,
      text,
      metadata: { sourcePath, sourceTitle, chunkIndex: idx, contentHash }
    });
  }
  return records;
}

async function filterExisting(collection: Awaited<ReturnType<typeof getChromaCollection>>, ids: string[]) {
  if (ids.length === 0) return new Set<string>();
  const existing = new Set<string>();
  const batchSize = 256;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const res = await collection.get({ ids: batch });
    for (const id of res.ids ?? []) existing.add(id);
  }
  return existing;
}

export async function ingestMarkdownFiles(files: { filename: string; content: string }[]) {
  const collection = await getChromaCollection();
  const all: ChunkRecord[] = [];

  for (const f of files) {
    const sourcePath = `upload://${f.filename}`;
    const chunkDocs = await semanticChunkMarkdown(f.content);
    all.push(...toChunkRecords(sourcePath, chunkDocs));
  }

  // Deduplicate within batch first
  const uniqueById = new Map<string, ChunkRecord>();
  for (const r of all) if (!uniqueById.has(r.id)) uniqueById.set(r.id, r);
  const deduped = [...uniqueById.values()];

  const existing = await filterExisting(
    collection,
    deduped.map((r) => r.id)
  );
  const newOnes = deduped.filter((r) => !existing.has(r.id));

  const batchSize = env.SEED_BATCH_SIZE;
  for (let i = 0; i < newOnes.length; i += batchSize) {
    const batch = newOnes.slice(i, i + batchSize);
    await collection.add({
      ids: batch.map((b) => b.id),
      documents: batch.map((b) => b.text),
      metadatas: batch.map((b) => b.metadata)
    });
  }

  return { totalChunks: all.length, dedupedChunks: deduped.length, inserted: newOnes.length, skipped: deduped.length - newOnes.length };
}

