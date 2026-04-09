import path from "node:path";
import { Document } from "@langchain/core/documents";
import { env } from "../config/env.js";
import { getChromaCollection } from "../services/chroma.js";
import { getEmbeddings } from "../services/embeddings.js";
import { sha256Hex } from "../utils/crypto.js";
import { listFilesRecursive, readTextFile } from "../utils/fs.js";

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

function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0;
  let a2 = 0;
  let b2 = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    a2 += av * av;
    b2 += bv * bv;
  }
  const denom = Math.sqrt(a2) * Math.sqrt(b2);
  return denom === 0 ? 0 : dot / denom;
}

function addInPlace(sum: number[], v: number[]) {
  for (let i = 0; i < v.length; i++) sum[i] = (sum[i] ?? 0) + (v[i] ?? 0);
}

function avgVector(sum: number[], count: number) {
  if (count <= 0) return sum;
  return sum.map((x) => x / count);
}

function splitMarkdownIntoUnits(markdown: string) {
  // Simple, robust unitization: split on blank lines.
  // This works well for Markdown where headings/bullets are often separated by whitespace.
  return markdown
    .split(/\r?\n\s*\r?\n/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function semanticChunkMarkdown(markdown: string) {
  const embeddings = getEmbeddings();
  const units = splitMarkdownIntoUnits(markdown);
  if (units.length === 0) return [];

  const unitVectors: number[][] = [];
  const embedBatchSize = Math.min(96, env.SEED_BATCH_SIZE);
  for (let i = 0; i < units.length; i += embedBatchSize) {
    const batch = units.slice(i, i + embedBatchSize);
    const vectors = await embeddings.embedDocuments(batch);
    unitVectors.push(...vectors);
  }

  const out: Document[] = [];
  let currentParts: string[] = [];
  let currentLen = 0;
  let currentSum: number[] = [];
  let currentCount = 0;

  for (let i = 0; i < units.length; i++) {
    const unit = units[i]!;
    const unitVec = unitVectors[i]!;

    if (currentParts.length === 0) {
      currentParts = [unit];
      currentLen = unit.length;
      currentSum = [...unitVec];
      currentCount = 1;
      continue;
    }

    const wouldExceedMax = currentLen + 2 + unit.length > env.CHUNK_MAX_CHARS;
    const sim = cosineSimilarity(avgVector(currentSum, currentCount), unitVec);
    const semanticBreak = sim < env.SEMANTIC_BREAKPOINT_THRESHOLD;
    const canBreakNow = currentLen >= env.CHUNK_MIN_CHARS;

    if (canBreakNow && (wouldExceedMax || semanticBreak)) {
      out.push(new Document({ pageContent: currentParts.join("\n\n") }));
      currentParts = [unit];
      currentLen = unit.length;
      currentSum = [...unitVec];
      currentCount = 1;
      continue;
    }

    currentParts.push(unit);
    currentLen += 2 + unit.length;
    addInPlace(currentSum, unitVec);
    currentCount += 1;
  }

  if (currentParts.length > 0) out.push(new Document({ pageContent: currentParts.join("\n\n") }));
  return out;
}

function toChunkRecords(filePath: string, docs: Document[]) {
  const sourceTitle = titleFromPath(filePath);
  return docs
    .map((d, idx) => {
      const text = (d.pageContent ?? "").trim();
      if (!text) return null;
      const contentHash = sha256Hex(text);
      const id = sha256Hex(`${filePath}::${contentHash}`);
      const record: ChunkRecord = {
        id,
        text,
        metadata: {
          sourcePath: filePath,
          sourceTitle,
          chunkIndex: idx,
          contentHash
        }
      };
      return record;
    })
    .filter((x): x is ChunkRecord => Boolean(x));
}

async function filterExisting(collection: Awaited<ReturnType<typeof getChromaCollection>>, ids: string[]) {
  if (ids.length === 0) return new Set<string>();
  const existing = new Set<string>();

  // Chroma can handle a fair number of ids in one get, but we batch anyway.
  const batchSize = 256;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const res = await collection.get({ ids: batch });
    for (const id of res.ids ?? []) existing.add(id);
  }
  return existing;
}

async function main() {
  const docsDir = path.resolve(process.cwd(), env.DOCS_DIR);
  const allFiles = await listFilesRecursive(docsDir);
  const mdFiles = allFiles.filter((f) => f.toLowerCase().endsWith(".md"));

  if (mdFiles.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`No .md files found under ${docsDir}`);
    return;
  }

  const collection = await getChromaCollection();
  const toUpsert: ChunkRecord[] = [];

  for (const filePath of mdFiles) {
    const markdown = await readTextFile(filePath);
    const chunkDocs = await semanticChunkMarkdown(markdown);
    toUpsert.push(...toChunkRecords(filePath, chunkDocs));
  }

  const existing = await filterExisting(
    collection,
    toUpsert.map((r) => r.id)
  );
  const newOnes = toUpsert.filter((r) => !existing.has(r.id));

  // eslint-disable-next-line no-console
  console.log(
    `Seed summary: files=${mdFiles.length}, chunks=${toUpsert.length}, new=${newOnes.length}, skipped=${toUpsert.length - newOnes.length}`
  );

  const batchSize = env.SEED_BATCH_SIZE;
  for (let i = 0; i < newOnes.length; i += batchSize) {
    const batch = newOnes.slice(i, i + batchSize);
    await collection.add({
      ids: batch.map((b) => b.id),
      documents: batch.map((b) => b.text),
      metadatas: batch.map((b) => b.metadata)
    });
  }

  // eslint-disable-next-line no-console
  console.log("Done.");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
