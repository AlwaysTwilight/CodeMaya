import hashlib
import os
from dataclasses import dataclass
from typing import List, Tuple

from app.embeddings import embed_texts


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def split_markdown_into_units(md: str) -> List[str]:
    return [p.strip() for p in md.split("\n\n") if p.strip()]


def cosine(a: List[float], b: List[float]) -> float:
    dot = sum((a[i] if i < len(a) else 0.0) * (b[i] if i < len(b) else 0.0) for i in range(min(len(a), len(b))))
    a2 = sum(x * x for x in a)
    b2 = sum(x * x for x in b)
    denom = (a2**0.5) * (b2**0.5)
    return 0.0 if denom == 0 else dot / denom


def avg_vec(sum_vec: List[float], n: int) -> List[float]:
    if n <= 0:
        return sum_vec
    return [x / n for x in sum_vec]


@dataclass
class Chunk:
    id: str
    text: str
    metadata: dict


def semantic_chunk(markdown: str, source_path: str, source_title: str) -> List[Chunk]:
    min_chars = int(os.getenv("CHUNK_MIN_CHARS", "300"))
    max_chars = int(os.getenv("CHUNK_MAX_CHARS", "1500"))
    thresh = float(os.getenv("SEMANTIC_BREAKPOINT_THRESHOLD", "0.55"))

    units = split_markdown_into_units(markdown)
    if not units:
        return []

    unit_vecs = embed_texts(units)
    chunks: List[Chunk] = []

    cur_parts: List[str] = []
    cur_len = 0
    cur_sum: List[float] = []
    cur_count = 0

    def flush():
        nonlocal cur_parts, cur_len, cur_sum, cur_count
        if not cur_parts:
            return
        text = "\n\n".join(cur_parts).strip()
        if text:
            content_hash = sha256_hex(text)
            chunk_id = sha256_hex(f"{source_path}::{content_hash}")
            chunks.append(
                Chunk(
                    id=chunk_id,
                    text=text,
                    metadata={
                        "sourcePath": source_path,
                        "sourceTitle": source_title,
                        "chunkIndex": len(chunks),
                        "contentHash": content_hash,
                    },
                )
            )
        cur_parts = []
        cur_len = 0
        cur_sum = []
        cur_count = 0

    for unit, vec in zip(units, unit_vecs):
        if not cur_parts:
            cur_parts = [unit]
            cur_len = len(unit)
            cur_sum = list(vec)
            cur_count = 1
            continue

        would_exceed = cur_len + 2 + len(unit) > max_chars
        sim = cosine(avg_vec(cur_sum, cur_count), vec)
        semantic_break = sim < thresh
        can_break = cur_len >= min_chars

        if can_break and (would_exceed or semantic_break):
            flush()
            cur_parts = [unit]
            cur_len = len(unit)
            cur_sum = list(vec)
            cur_count = 1
            continue

        cur_parts.append(unit)
        cur_len += 2 + len(unit)
        if len(cur_sum) < len(vec):
            cur_sum.extend([0.0] * (len(vec) - len(cur_sum)))
        for i in range(len(vec)):
            cur_sum[i] += float(vec[i])
        cur_count += 1

    flush()
    return chunks


def upsert_chunks(collection, chunks: List[Chunk]) -> Tuple[int, int]:
    if not chunks:
        return (0, 0)

    unique_by_id = {}
    for c in chunks:
        if c.id not in unique_by_id:
            unique_by_id[c.id] = c
    deduped_chunks = list(unique_by_id.values())

    ids = [c.id for c in deduped_chunks]
    existing_ids = set()

    batch = 256
    for i in range(0, len(ids), batch):
        res = collection.get(ids=ids[i : i + batch])
        for _id in res.get("ids", []) or []:
            existing_ids.add(_id)

    new_chunks = [c for c in deduped_chunks if c.id not in existing_ids]
    if not new_chunks:
        return (0, len(chunks))

    vectors = embed_texts([c.text for c in new_chunks])
    collection.add(
        ids=[c.id for c in new_chunks],
        documents=[c.text for c in new_chunks],
        metadatas=[c.metadata for c in new_chunks],
        embeddings=vectors,
    )
    return (len(new_chunks), len(chunks) - len(new_chunks))

