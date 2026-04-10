import os
import sys
from pathlib import Path

import streamlit as st
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.auth import get_user_from_token, login_user, register_user  # noqa: E402
from app.chroma_client import get_chroma_collection  # noqa: E402
from app.db import ensure_indexes, get_db, now_utc  # noqa: E402
from app.ingest import semantic_chunk, upsert_chunks  # noqa: E402
from app.rag import grounded_answer, retrieve  # noqa: E402
from app.rate_limit import check_and_consume  # noqa: E402

load_dotenv()
ensure_indexes()

st.set_page_config(page_title="Codemaya RAG", layout="wide")
st.title("Codemaya RAG - Inject Markdown + Chat (Grounded)")


@st.cache_resource
def _collection():
    return get_chroma_collection()


def _is_greeting(text: str) -> bool:
    t = (text or "").strip().lower()
    return t in {"hi", "hello", "hey", "yo", "hii", "hlo"} or t.startswith(("hi ", "hello ", "hey "))


with st.sidebar:
    st.header("Chroma")
    st.text_input("CHROMA_URL", value=os.getenv("CHROMA_URL", "http://localhost:8000"), disabled=True)
    st.text_input("CHROMA_TENANT", value=os.getenv("CHROMA_TENANT", "default_tenant"), disabled=True)
    st.text_input("CHROMA_DATABASE", value=os.getenv("CHROMA_DATABASE", "default_database"), disabled=True)
    st.text_input("CHROMA_COLLECTION", value=os.getenv("CHROMA_COLLECTION", "codemaya_docs"), disabled=True)
    try:
        st.caption(f"collection_count={_collection().count()}")
    except Exception as e:
        st.error(f"Chroma error: {e}")

    st.header("Embeddings")
    st.text_input("EMBEDDINGS_PROVIDER", value=os.getenv("EMBEDDINGS_PROVIDER", "offline"), disabled=True)
    if os.getenv("EMBEDDINGS_PROVIDER", "offline").lower() == "hf":
        st.caption(f"HF model: {os.getenv('HF_EMBEDDINGS_MODEL','BAAI/bge-large-en')}")

    st.header("RAG")
    st.caption(f"RAG_MAX_DISTANCE={os.getenv('RAG_MAX_DISTANCE','').strip() or '(disabled)'}")

    st.header("LLM")
    st.text_input("GROQ_MODEL", value=os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"), disabled=True)

st.session_state.setdefault("token", os.getenv("JWT_TOKEN", "").strip() or None)
user = get_user_from_token(st.session_state.get("token"))

if not user:
    st.subheader("Login")
    tab_login, tab_signup = st.tabs(["Login", "Sign up"])

    with tab_login:
        email = st.text_input("Email", key="login_email")
        password = st.text_input("Password", type="password", key="login_password")
        if st.button("Login", type="primary"):
            try:
                token = login_user(email=email, password=password)
                st.session_state["token"] = token
                st.success("Logged in.")
                st.rerun()
            except Exception as e:
                st.error(str(e))

    with tab_signup:
        email = st.text_input("Email", key="signup_email")
        password = st.text_input("Password (min 8 chars)", type="password", key="signup_password")
        if st.button("Create account", type="primary"):
            try:
                register_user(email=email, password=password)
                token = login_user(email=email, password=password)
                st.session_state["token"] = token
                st.success("Account created.")
                st.rerun()
            except Exception as e:
                st.error(str(e))

    st.stop()

with st.sidebar:
    st.header("Account")
    st.caption(f"email={user.get('email')}")
    if st.button("Logout"):
        st.session_state["token"] = None
        st.rerun()

col_up, col_chat = st.columns([1, 1])

with col_up:
    st.subheader("1) Upload Markdown and Inject")
    uploads = st.file_uploader("Markdown files", type=["md"], accept_multiple_files=True)
    inject = st.button("Inject", type="primary")

    if inject:
        if not uploads:
            st.info("No files uploaded; nothing injected.")
        else:
            collection = _collection()
            before = collection.count()
            total_new = 0
            total_skipped = 0
            for uf in uploads:
                raw = uf.read().decode("utf-8", errors="replace")
                source_path = f"upload://{uf.name}"
                source_title = Path(uf.name).stem
                chunks = semantic_chunk(raw, source_path=source_path, source_title=source_title)
                new_count, skipped_count = upsert_chunks(collection, chunks)
                total_new += new_count
                total_skipped += skipped_count
            after = collection.count()
            st.success(
                f"Injected: new_chunks={total_new}, skipped_duplicates={total_skipped}, count_before={before}, count_after={after}"
            )

with col_chat:
    st.subheader("2) Chat (Grounded to DB)")
    if "messages" not in st.session_state:
        st.session_state.messages = []

    for m in st.session_state.messages:
        with st.chat_message(m["role"]):
            st.write(m["content"])

    prompt = st.chat_input("Ask a question about your documents...")
    if prompt:
        st.session_state.messages.append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            st.write(prompt)

        with st.chat_message("assistant"):
            try:
                if _is_greeting(prompt):
                    st.write("Hi - ask me a question about the documents in the vector DB.")
                    raise SystemExit

                allowed, remaining = check_and_consume(user_id=user["userId"], limit_per_minute=10)
                if not allowed:
                    st.warning("Rate limit exceeded: 10 messages/minute. Try again shortly.")
                    raise SystemExit

                collection = _collection()
                contexts, best_dist = retrieve(collection, prompt, top_k=6)

                max_dist_raw = os.getenv("RAG_MAX_DISTANCE", "").strip()
                max_dist = float(max_dist_raw) if max_dist_raw else None

                if not contexts:
                    st.write("I don't know based on the provided documents. (no retrieved context)")
                elif max_dist is not None and best_dist > max_dist:
                    st.write(
                        "I don't know based on the provided documents. (retrieval_best_distance={best_dist:.4f} > threshold={max_dist})"
                    )
                else:
                    data = grounded_answer(prompt, contexts)
                    st.write(data.get("answer", ""))
                    if data.get("sources"):
                        st.caption("Sources: " + ", ".join(data["sources"]))
                    st.caption(f"rate_limit_remaining={remaining}")
                    with st.expander("Retrieved chunks"):
                        for c in contexts:
                            meta = c.get("meta") or {}
                            st.write(
                                f"- id={c.get('id')} distance={c.get('distance'):.4f} source={meta.get('sourceTitle')} chunkIndex={meta.get('chunkIndex')}"
                            )

                    # Persist history (last 10 shown via sidebar button).
                    db = get_db()
                    db.chat_history.insert_one(
                        {
                            "userId": user["userId"],
                            "question": prompt[:500],
                            "answer": (data.get("answer") or "")[:4000],
                            "sources": data.get("sources") or [],
                            "confidence": data.get("confidence") or "low",
                            "createdAt": now_utc(),
                        }
                    )
            except SystemExit:
                pass
            except Exception as e:
                st.error(str(e))

with st.sidebar:
    if st.button("Show last 10 Q&A"):
        db = get_db()
        items = list(db.chat_history.find({"userId": user["userId"]}).sort("createdAt", -1).limit(10))
        if not items:
            st.info("No history yet.")
        else:
            for it in items:
                st.write(f"Q: {it.get('question')}")
                st.write(f"A: {it.get('answer')}")
                st.caption(f"sources={it.get('sources')}, confidence={it.get('confidence')}")
