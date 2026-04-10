import Groq from "groq-sdk";
import { env } from "../config/env.js";
import { getChromaCollection } from "./chroma.js";
import { getEmbeddings } from "./embeddings.js";

export type AskResult = {
  answer: string;
  sources: string[];
  confidence: "high" | "medium" | "low";
  retrievalBestDistance: number;
};

function confidenceFromDistance(d: number): "high" | "medium" | "low" {
  if (d < 1.25) return "high";
  if (d < 1.45) return "medium";
  return "low";
}

export async function askGrounded(question: string): Promise<AskResult> {
  if (!env.GROQ_API_KEY) {
    throw Object.assign(new Error("Missing GROQ_API_KEY (set it in .env)"), { status: 500, expose: true });
  }
  const collection = await getChromaCollection();
  const embeddings = getEmbeddings();
  const q = question.trim();
  if (!q) throw Object.assign(new Error("Question is required"), { status: 400 });

  const qvec = await embeddings.embedQuery(q);
  const res = await collection.query({
    queryEmbeddings: [qvec],
    nResults: env.TOP_K,
    include: ["documents", "metadatas", "distances"]
  });

  const docs = res.documents?.[0] ?? [];
  const metas = res.metadatas?.[0] ?? [];
  const dists = res.distances?.[0] ?? [];
  const bestDist = dists.length ? Number(dists[0]) : Number.POSITIVE_INFINITY;

  if (!docs.length) {
    return { answer: "I don’t know based on the provided documents.", sources: [], confidence: "low", retrievalBestDistance: bestDist };
  }

  const sources = metas.map((m: any, i: number) => `${m?.sourceTitle ?? "doc"}-${m?.chunkIndex ?? i}`);
  const contextBlocks = docs.map((d, i) => `[${sources[i]}]\n${d}`);
  const context = contextBlocks.join("\n\n");

  const groq = new Groq({ apiKey: env.GROQ_API_KEY });
  const system =
    "You are a grounded Q&A assistant.\n" +
    "RULES:\n" +
    "1) Answer ONLY using the provided CONTEXT.\n" +
    "2) If the answer is not explicitly in the context, reply exactly: I don’t know based on the provided documents.\n" +
    "3) Be concise.\n";

  const completion = await groq.chat.completions.create({
    model: env.GROQ_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: `QUESTION:\n${q}\n\nCONTEXT:\n${context}` }
    ]
  });

  const answer = (completion.choices[0]?.message?.content ?? "").trim() || "I don’t know based on the provided documents.";
  const confidence = confidenceFromDistance(bestDist);

  // Hard guardrail: if the model tries to answer with empty context, refuse.
  if (answer.toLowerCase().includes("i don’t know") || answer.toLowerCase().includes("i don't know")) {
    return { answer: "I don’t know based on the provided documents.", sources: [], confidence: "low", retrievalBestDistance: bestDist };
  }

  return { answer, sources, confidence, retrievalBestDistance: bestDist };
}
