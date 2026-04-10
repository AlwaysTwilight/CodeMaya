import os
from urllib.parse import urlparse

import chromadb


def get_chroma_collection():
    chroma_url = os.getenv("CHROMA_URL", "http://localhost:8000").strip()
    collection_name = os.getenv("CHROMA_COLLECTION", "codemaya_docs").strip()
    tenant = os.getenv("CHROMA_TENANT", "default_tenant").strip()
    database = os.getenv("CHROMA_DATABASE", "default_database").strip()

    u = urlparse(chroma_url)
    host = u.hostname or "localhost"
    port = u.port or (443 if u.scheme == "https" else 80)
    ssl = u.scheme == "https"

    try:
        client = chromadb.HttpClient(host=host, port=port, ssl=ssl, tenant=tenant, database=database)
        return client.get_or_create_collection(name=collection_name)
    except Exception as e:
        msg = str(e).lower()
        if "tenant" in msg or "not found" in msg or "could not connect" in msg or "500" in msg:
            client = chromadb.HttpClient(
                host=host,
                port=port,
                ssl=ssl,
                tenant="default_tenant",
                database="default_database",
            )
            return client.get_or_create_collection(name=collection_name)
        raise

