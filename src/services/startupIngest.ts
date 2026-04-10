import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { listFilesRecursive } from "../utils/fs.js";
import { ingestMarkdownFiles } from "./ingest.js";

export async function ingestDocsDirOnStart() {
  if (!env.AUTO_INGEST_ON_START) return;
  const dir = path.resolve(process.cwd(), env.DOCS_DIR);
  const files = (await listFilesRecursive(dir)).filter((f) => f.toLowerCase().endsWith(".md"));
  if (files.length === 0) return;
  const payload = await Promise.all(
    files.map(async (f) => ({ filename: path.basename(f), content: await readFile(f, "utf8") }))
  );
  // Chroma may not be ready immediately at container start; retry a bit.
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const result = await ingestMarkdownFiles(payload);
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ at: "startup_ingest", dir, files: files.length, attempt, ...result }));
      return;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ at: "startup_ingest_failed", dir, files: files.length, error: String((lastErr as any)?.message ?? lastErr) }));
}
