# Codemaya - RAG Assignment

## What’s Included

- Node seed pipeline (`npm run seed`) that semantic-chunks Markdown docs and stores deduped chunks in Chroma (`src/scripts/seed.ts`)
- Streamlit app with:
  - Signup/login via JWT (users stored in MongoDB)
  - Per-user rate limiting: 10 messages/minute
  - Chat history (last 10 Q&A per user)
  - Upload Markdown -> chunk/embed/dedupe -> store in Chroma -> grounded chat using Groq

## Quick Start (Docker)

```bash
cp .env.example .env
docker compose up -d --build
```

Open:
- Website: `http://localhost:3000`
- Chroma: `http://localhost:8000`
- MongoDB: `mongodb://localhost:27017`
- Redis: `redis://localhost:6379`

## Local Node Seed (optional)

```bash
npm i
cp .env.example .env
npm run seed
```

Notes:
- Re-running seed skips duplicates (stable SHA-256 IDs).
- Chroma `0.5.5` uses `default_tenant` / `default_database`.
