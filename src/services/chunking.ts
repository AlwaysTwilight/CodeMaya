import { Document } from "@langchain/core/documents";
import { env } from "../config/env.js";
import { getEmbeddings } from "./embeddings.js";

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

export function splitMarkdownIntoUnits(markdown: string) {
  return markdown
    .split(/\r?\n\s*\r?\n/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function semanticChunkMarkdown(markdown: string) {
  const embeddings = getEmbeddings();
  const units = splitMarkdownIntoUnits(markdown);
  if (units.length === 0) return [];

  const unitVectors = await embeddings.embedDocuments(units);

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

