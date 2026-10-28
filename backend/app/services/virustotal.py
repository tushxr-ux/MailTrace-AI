import time
from collections import deque

import httpx


class RateLimiter:
    """Sliding-window limiter for VirusTotal's free tier (4/min, 500/day)."""

    def __init__(self, per_minute: int, per_day: int) -> None:
        self.per_minute, self.per_day = per_minute, per_day
        self._min: deque[float] = deque()
        self._day: deque[float] = deque()

    def try_acquire(self) -> bool:
        now = time.time()
        while self._min and now - self._min[0] > 60:
            self._min.popleft()
        while self._day and now - self._day[0] > 86400:
            self._day.popleft()
        if len(self._min) >= self.per_minute or len(self._day) >= self.per_day:
            return False
        self._min.append(now)
        self._day.append(now)
        return True


class RateLimited(Exception):
    pass


async def domain_reputation(client: httpx.AsyncClient, limiter: RateLimiter, api_key: str, domain: str) -> dict:
    if not api_key:
        raise RuntimeError("VT_API_KEY not configured")
    if not limiter.try_acquire():
        raise RateLimited()
    r = await client.get(f"https://www.virustotal.com/api/v3/domains/{domain}", headers={"x-apikey": api_key})
    if r.status_code == 404:
        return {"vtMalicious": 0, "vtSuspicious": 0}
    if r.status_code == 429:
        raise RateLimited()
    r.raise_for_status()
    stats = r.json().get("data", {}).get("attributes", {}).get("last_analysis_stats", {})
    return {"vtMalicious": int(stats.get("malicious", 0)), "vtSuspicious": int(stats.get("suspicious", 0))}
