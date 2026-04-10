import os
from datetime import datetime, timedelta, timezone

from pymongo import MongoClient, ASCENDING


_client = None


def get_mongo_client() -> MongoClient:
    global _client
    if _client is None:
        uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017/codemaya").strip()
        _client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    return _client


def get_db():
    # If MONGODB_URI includes a db name, pymongo will select it as default_database.
    client = get_mongo_client()
    db = client.get_default_database()
    if db is None:
        db = client["codemaya"]
    return db


def ensure_indexes():
    db = get_db()
    db.users.create_index([("email", ASCENDING)], unique=True)
    db.chat_history.create_index([("userId", ASCENDING), ("createdAt", ASCENDING)])
    # Usage events for rate limiting (TTL).
    db.usage_events.create_index([("ts", ASCENDING)], expireAfterSeconds=120)
    db.usage_events.create_index([("userId", ASCENDING), ("ts", ASCENDING)])


def now_utc():
    return datetime.now(timezone.utc)


def one_minute_ago():
    return now_utc() - timedelta(seconds=60)

