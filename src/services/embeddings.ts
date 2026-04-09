import { createHash } from "node:crypto";
import { HfInference } from "@huggingface/inference";
import { env } from "../config/env.js";

function meanPool(tokenVectors: number[][]) {
  const dim = tokenVectors[0]?.length ?? 0;
  const out = new Array<number>(dim).fill(0);
  for (const tv of tokenVectors) {
    for (let i = 0; i < dim; i++) out[i] += tv[i] ?? 0;
  }
  const n = tokenVectors.length || 1;
  for (let i = 0; i < dim; i++) out[i] /= n;
  return out;
}

function l2Normalize(v: number[]) {
  let sum = 0;
  for (const x of v) sum += x * x;
  const denom = Math.sqrt(sum) || 1;
  return v.map((x) => x / denom);
}

function stableTokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[`*_>#()[\]{}|~]/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function tokenToIndex(token: string, dim: number) {
  // Fast, stable hash -> index
  const h = createHash("sha256").update(token).digest();
  const n = h.readUInt32LE(0);
  return n % dim;
}

function tokenToSign(token: string) {
  const h = createHash("sha256").update(`sign:${token}`).digest();
  return (h[0]! & 1) === 0 ? 1 : -1;
}

async function embedTexts(texts: string[]) {
  const dim = env.EMBEDDINGS_DIM;
  return texts.map((text) => {
    const v = new Array<number>(dim).fill(0);
    const tokens = stableTokenize(text);
    for (const token of tokens) {
      const idx = tokenToIndex(token, dim);
      v[idx] += tokenToSign(token);
    }
    return l2Normalize(v);
  });
}

export type Embeddings = {
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
};

async function embedTextsHf(texts: string[]) {
  if (!env.HF_TOKEN) {
    throw new Error("Missing HF_TOKEN (required when EMBEDDINGS_PROVIDER=hf).");
  }
  const hf = new HfInference(env.HF_TOKEN);
  const vectors: number[][] = [];

  // Be gentle to free-tier limits.
  const batchSize = 8;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    for (const t of batch) {
      const res: unknown = await hf.featureExtraction({
        model: env.HF_EMBEDDINGS_MODEL,
        inputs: t
      });

      // HF feature-extraction may return:
      // - number[] (already pooled)
      // - number[][] (token vectors)
      const v =
        Array.isArray(res) && typeof (res as any)[0] === "number"
          ? (res as number[])
          : Array.isArray(res) && Array.isArray((res as any)[0])
            ? meanPool(res as number[][])
            : null;

      if (!v) {
        throw new Error(`Unexpected HF featureExtraction response shape for model ${env.HF_EMBEDDINGS_MODEL}`);
      }
      vectors.push(l2Normalize(v));
    }
  }

  return vectors;
}

export function getEmbeddings(): Embeddings {
  if (env.EMBEDDINGS_PROVIDER === "hf") {
    return {
      embedDocuments: async (texts) => embedTextsHf(texts),
      embedQuery: async (text) => (await embedTextsHf([text]))[0]!
    };
  }
  return {
    embedDocuments: async (texts) => embedTexts(texts),
    embedQuery: async (text) => (await embedTexts([text]))[0]!
  };
}
