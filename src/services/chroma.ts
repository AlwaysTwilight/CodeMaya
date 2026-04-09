import { AdminClient, ChromaClient } from "chromadb";
import { env } from "../config/env.js";
import { getEmbeddings } from "./embeddings.js";

export type ChromaDocMetadata = {
  sourcePath: string;
  sourceTitle: string;
  chunkIndex: number;
  contentHash: string;
};

function parseChromaUrl(urlStr: string) {
  const u = new URL(urlStr);
  const ssl = u.protocol === "https:";
  const host = u.hostname;
  const port = u.port ? Number(u.port) : ssl ? 443 : 80;
  return { host, port, ssl };
}

export async function getChromaCollection() {
  const { host, port, ssl } = parseChromaUrl(env.CHROMA_URL);

  // Ensure we never use the server defaults. Create/get a tenant+database
  // dedicated for this project.
  const admin = new AdminClient({ host, port, ssl });
  try {
    await admin.getTenant({ name: env.CHROMA_TENANT });
  } catch {
    await admin.createTenant({ name: env.CHROMA_TENANT });
  }
  try {
    await admin.getDatabase({ tenant: env.CHROMA_TENANT, name: env.CHROMA_DATABASE });
  } catch {
    await admin.createDatabase({ tenant: env.CHROMA_TENANT, name: env.CHROMA_DATABASE });
  }

  const client = new ChromaClient({
    host,
    port,
    ssl,
    tenant: env.CHROMA_TENANT,
    database: env.CHROMA_DATABASE
  });
  return client.getOrCreateCollection({
    name: env.CHROMA_COLLECTION,
    // Avoid the chromadb client trying to auto-instantiate its default embedding function.
    // We supply our own so the collection can embed when needed (and so search works later).
    embeddingFunction: {
      name: "local-embeddings",
      generate: async (texts: string[]) => {
        const embeddings = getEmbeddings();
        return embeddings.embedDocuments(texts);
      },
      generateForQueries: async (texts: string[]) => {
        const embeddings = getEmbeddings();
        return embeddings.embedDocuments(texts);
      }
    }
  });
}
