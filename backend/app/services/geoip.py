import os
from functools import lru_cache


@lru_cache(maxsize=2)
def _reader(path: str):
    if not path or not os.path.exists(path):
        return None
    import geoip2.database  # local import: optional dependency at runtime

    return geoip2.database.Reader(path)


def locate(city_db: str, asn_db: str, ip: str) -> dict:
    """Self-hosted MaxMind lookups — no network call, nothing leaves the server."""
    out: dict = {}
    city = _reader(city_db)
    if city:
        try:
            c = city.city(ip)
            out.update(country=c.country.iso_code, city=c.city.name, lat=c.location.latitude, lon=c.location.longitude)
        except Exception:
            pass
    asn = _reader(asn_db)
    if asn:
        try:
            a = asn.asn(ip)
            out.update(asn=f"AS{a.autonomous_system_number}", isp=a.autonomous_system_organization)
        except Exception:
            pass
    return out
