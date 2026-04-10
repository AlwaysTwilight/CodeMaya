from typing import Tuple

from app.db import ensure_indexes, get_db, now_utc, one_minute_ago


def check_and_consume(user_id: str, limit_per_minute: int = 10) -> Tuple[bool, int]:
    """
    Returns (allowed, remaining_in_window).
    Uses a TTL collection of timestamped usage events.
    """
    ensure_indexes()
    db = get_db()
    ts = now_utc()
    db.usage_events.insert_one({"userId": user_id, "ts": ts})

    window_start = one_minute_ago()
    used = db.usage_events.count_documents({"userId": user_id, "ts": {"$gt": window_start}})
    remaining = max(0, limit_per_minute - int(used))
    allowed = used <= limit_per_minute
    return allowed, remaining

