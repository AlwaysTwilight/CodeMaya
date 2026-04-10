import json
import os
from typing import Any, Dict, List, Tuple

from groq import Groq

from app.embeddings import embed_texts


def retrieve(collection, question: str, top_k: int = 6) -> Tuple[List[Dict[str, Any]], float]:
    qvec = embed_texts([question])[0]
    res = collection.query(
        query_embeddings=[qvec],
        n_results=top_k,
        include=["documents", "metadatas", "distances"],
    )
    docs = (res.get("documents") or [[]])[0] or []
    metas = (res.get("metadatas") or [[]])[0] or []
    dists = (res.get("distances") or [[]])[0] or []
    ids = (res.get("ids") or [[]])[0] or []

    best_dist = float(dists[0]) if dists else 1e9
    out: List[Dict[str, Any]] = []
    for d, m, dist, _id in zip(docs, metas, dists, ids):
        out.append({"id": _id, "text": d, "meta": m, "distance": float(dist)})
    return out, best_dist


def grounded_answer(question: str, contexts: List[Dict[str, Any]]) -> Dict[str, Any]:
    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    if not groq_key:
        raise ValueError("Missing GROQ_API_KEY")

    model = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant").strip()
    client = Groq(api_key=groq_key)

    sources = []
    ctx_blocks = []
    for i, c in enumerate(contexts):
        meta = c.get("meta") or {}
        source_id = f"{meta.get('sourceTitle','doc')}-{meta.get('chunkIndex', i)}"
        sources.append(source_id)
        ctx_blocks.append(f"[{source_id}]\n{c.get('text','')}")

    context_text = "\n\n".join(ctx_blocks).strip()

    system = (
        "You are a grounded Q&A assistant.\n"
        "RULES:\n"
        "1) Answer ONLY using the provided CONTEXT.\n"
        "2) If the answer is not explicitly in the context, respond with:\n"
        '   {"answer":"I don\\u2019t know based on the provided documents.","sources":[],"confidence":"low"}\n'
        "3) Output must be valid JSON with keys: answer (string), sources (array of strings), confidence ('high'|'medium'|'low').\n"
        "4) No extra keys, no markdown.\n"
    )

    user = f"QUESTION:\n{question}\n\nCONTEXT:\n{context_text if context_text else '[EMPTY]'}"

    resp = client.chat.completions.create(
        model=model,
        temperature=0,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        response_format={"type": "json_object"},
    )

    content = resp.choices[0].message.content or "{}"
    data = json.loads(content)

    if not contexts or not isinstance(data.get("answer"), str):
        return {"answer": "I don’t know based on the provided documents.", "sources": [], "confidence": "low"}

    data_sources = data.get("sources") or []
    data["sources"] = [s for s in data_sources if s in set(sources)]
    return data

