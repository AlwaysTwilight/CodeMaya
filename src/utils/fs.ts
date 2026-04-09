import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(p)));
    } else if (entry.isFile()) {
      files.push(p);
    }
  }
  return files;
}

export async function readTextFile(filePath: string) {
  const s = await stat(filePath);
  if (!s.isFile()) throw new Error(`Not a file: ${filePath}`);
  return readFile(filePath, "utf8");
}

