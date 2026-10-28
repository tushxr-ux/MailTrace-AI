import time
from typing import Any


class TTLCache:
    """Tiny in-memory TTL cache. Swap for Redis in production — same interface."""

    def __init__(self, max_items: int = 5000) -> None:
        self._d: dict[str, tuple[float, Any]] = {}
        self._max = max_items

    def get(self, key: str) -> Any | None:
        hit = self._d.get(key)
        if not hit:
            return None
        exp, val = hit
        if exp < time.time():
            self._d.pop(key, None)
            return None
        return val

    def set(self, key: str, val: Any, ttl: int) -> None:
        if len(self._d) >= self._max:
            self._d.pop(next(iter(self._d)))
        self._d[key] = (time.time() + ttl, val)
