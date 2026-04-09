# Codemaya — Data pipeline (semantic chunking → Chroma)

## Setup

```bash
npm i
cp .env.example .env
```

Run Chroma (local dev):

```bash
docker run --rm -p 8000:8000 chromadb/chroma
```

Add Markdown docs in `data/docs/` (any `*.md`).

## Seed (semantic chunking + dedupe)

```bash
npm run seed
```

Notes:
- Chunk IDs are stable SHA-256 hashes; re-running `seed` skips duplicates automatically.
- Semantic chunking uses local, offline hashing-vector embeddings (no downloads, no API key).
