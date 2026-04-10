import hashlib
import os
import re
from typing import List

from huggingface_hub import InferenceClient


def _l2_normalize(v: List[float]) -> List[float]:
    s = sum(x * x for x in v) ** 0.5
    if s == 0:
        return v
    return [x / s for x in v]


def _stable_tokenize(text: str) -> List[str]:
    text = text.lower()
    text = re.sub(r"[`*_>#()\\[\\]{}|~]", " ", text)
    text = re.sub(r"[^\w\s]+", " ", text, flags=re.UNICODE)
    tokens = [t.strip() for t in re.split(r"\s+", text) if t.strip()]
    return [t for t in tokens if len(t) >= 2]


def _sha256_bytes(s: str) -> bytes:
    return hashlib.sha256(s.encode("utf-8")).digest()


def _token_to_index(token: str, dim: int) -> int:
    h = _sha256_bytes(token)
    n = int.from_bytes(h[:4], "little", signed=False)
    return n % dim


def _token_to_sign(token: str) -> int:
    h = _sha256_bytes("sign:" + token)
    return 1 if (h[0] & 1) == 0 else -1


def embed_offline(texts: List[str], dim: int) -> List[List[float]]:
    out: List[List[float]] = []
    for text in texts:
        v = [0.0] * dim
        for token in _stable_tokenize(text):
            v[_token_to_index(token, dim)] += float(_token_to_sign(token))
        out.append(_l2_normalize(v))
    return out


def _mean_pool(tokens: List[List[float]]) -> List[float]:
    if not tokens:
        return []
    dim = len(tokens[0])
    acc = [0.0] * dim
    for tv in tokens:
        for i in range(dim):
            acc[i] += float(tv[i])
    n = float(len(tokens))
    return [x / n for x in acc]


def embed_hf(texts: List[str], hf_token: str, model: str) -> List[List[float]]:
    if not hf_token:
        raise ValueError("Missing HF_TOKEN (required when EMBEDDINGS_PROVIDER=hf).")
    client = InferenceClient(provider="hf-inference", api_key=hf_token)
    out: List[List[float]] = []
    for t in texts:
        res = client.feature_extraction(t, model=model)
        if res and isinstance(res[0], (float, int)):
            v = [float(x) for x in res]  # type: ignore[arg-type]
        else:
            v = _mean_pool(res)  # type: ignore[arg-type]
        out.append(_l2_normalize(v))
    return out


def embed_texts(texts: List[str]) -> List[List[float]]:
    provider = os.getenv("EMBEDDINGS_PROVIDER", "offline").strip().lower()
    if provider == "hf":
        return embed_hf(
            texts=texts,
            hf_token=os.getenv("HF_TOKEN", "").strip(),
            model=os.getenv("HF_EMBEDDINGS_MODEL", "BAAI/bge-large-en").strip(),
        )
    dim = int(os.getenv("EMBEDDINGS_DIM", "512"))
    return embed_offline(texts=texts, dim=dim)

