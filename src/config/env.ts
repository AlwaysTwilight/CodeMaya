import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // MongoDB (users + history)
  MONGODB_URI: z.string().min(1).default("mongodb://localhost:27017/codemaya"),

  // Auth
  JWT_SECRET: z.string().min(16).optional().default("change_me_change_me"),
  JWT_EXPIRES_IN: z.string().min(1).default("7d"),

  // Rate limiting (Redis)
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

  // LLM (Groq)
  GROQ_API_KEY: z.string().optional().default(""),
  GROQ_MODEL: z.string().min(1).default("llama-3.1-8b-instant"),

  CHROMA_URL: z.string().url().default("http://localhost:8000"),
  CHROMA_COLLECTION: z.string().min(1).default("codemaya_docs"),
  // Chroma 0.5.x defaults
  CHROMA_TENANT: z.string().min(1).default("default_tenant"),
  CHROMA_DATABASE: z.string().min(1).default("default_database"),
  EMBEDDINGS_PROVIDER: z.enum(["offline", "hf"]).default("offline"),
  EMBEDDINGS_DIM: z.coerce.number().int().positive().default(512),
  HF_TOKEN: z.string().optional().default(""),
  HF_EMBEDDINGS_MODEL: z.string().min(1).default("BAAI/bge-large-en"),
  DOCS_DIR: z.string().min(1).default("./data/docs"),
  CHUNK_MIN_CHARS: z.coerce.number().int().positive().default(300),
  CHUNK_MAX_CHARS: z.coerce.number().int().positive().default(1500),
  SEMANTIC_BREAKPOINT_THRESHOLD: z.coerce.number().min(0).max(1).default(0.55),
  SEED_BATCH_SIZE: z.coerce.number().int().positive().default(64),

  // RAG
  TOP_K: z.coerce.number().int().positive().default(6),

  // Startup ingestion
  AUTO_INGEST_ON_START: z.coerce.boolean().default(true)
});

export const env = EnvSchema.parse(process.env);
