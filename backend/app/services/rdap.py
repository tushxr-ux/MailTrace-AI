from datetime import datetime, timezone

import httpx

RDAP = "https://rdap.org/domain/{domain}"


async def domain_age(client: httpx.AsyncClient, domain: str) -> dict:
    """Domain age via RDAP (free, no key). ageDays=None when the registry hides the date."""
    r = await client.get(RDAP.format(domain=domain), follow_redirects=True)
    if r.status_code == 404:
        return {"ageDays": None, "createdAt": None, "registrar": None}
    r.raise_for_status()
    data = r.json()
    created = next((e.get("eventDate") for e in data.get("events", []) if e.get("eventAction") == "registration"), None)
    registrar = None
    for ent in data.get("entities", []):
        if "registrar" in ent.get("roles", []):
            for item in (ent.get("vcardArray") or [None, []])[1]:
                if item and item[0] == "fn":
                    registrar = item[3]
    age = None
    if created:
        dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        age = max(0, (datetime.now(timezone.utc) - dt).days)
    return {"ageDays": age, "createdAt": created, "registrar": registrar}
