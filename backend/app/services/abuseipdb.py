import httpx


async def ip_reputation(client: httpx.AsyncClient, api_key: str, ip: str) -> dict:
    if not api_key:
        raise RuntimeError("ABUSEIPDB_API_KEY not configured")
    r = await client.get(
        "https://api.abuseipdb.com/api/v2/check",
        params={"ipAddress": ip, "maxAgeInDays": 90},
        headers={"Key": api_key, "Accept": "application/json"},
    )
    r.raise_for_status()
    d = r.json().get("data", {})
    return {"abuseScore": int(d.get("abuseConfidenceScore", 0)), "reports": int(d.get("totalReports", 0)), "isp": d.get("isp")}
