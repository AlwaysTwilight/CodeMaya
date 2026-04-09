import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3000),
  CHROMA_URL: z.string().url().default("http://localhost:8000"),
  CHROMA_COLLECTION: z.string().min(1).default("codemaya_docs"),
  CHROMA_TENANT: z.string().min(1).default("codemaya_tenant"),
  CHROMA_DATABASE: z.string().min(1).default("codemaya_db"),
  EMBEDDINGS_PROVIDER: z.enum(["offline", "hf"]).default("offline"),
  EMBEDDINGS_DIM: z.coerce.number().int().positive().default(512),
  HF_TOKEN: z.string().optional().default(""),
  HF_EMBEDDINGS_MODEL: z.string().min(1).default("BAAI/bge-large-en"),
  DOCS_DIR: z.string().min(1).default("./data/docs"),
  CHUNK_MIN_CHARS: z.coerce.number().int().positive().default(300),
  CHUNK_MAX_CHARS: z.coerce.number().int().positive().default(1500),
  SEMANTIC_BREAKPOINT_THRESHOLD: z.coerce.number().min(0).max(1).default(0.55),
  SEED_BATCH_SIZE: z.coerce.number().int().positive().default(64)
});

export const env = EnvSchema.parse(process.env);
