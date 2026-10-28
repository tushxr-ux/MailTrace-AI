import os
from dataclasses import dataclass, field


def _csv(v: str) -> list[str]:
    return [x.strip() for x in v.split(",") if x.strip()]


@dataclass
class Settings:
    vt_api_key: str = field(default_factory=lambda: os.getenv("VT_API_KEY", ""))
    abuseipdb_api_key: str = field(default_factory=lambda: os.getenv("ABUSEIPDB_API_KEY", ""))
    geolite_city_path: str = field(default_factory=lambda: os.getenv("GEOLITE_CITY_PATH", "data/GeoLite2-City.mmdb"))
    geolite_asn_path: str = field(default_factory=lambda: os.getenv("GEOLITE_ASN_PATH", "data/GeoLite2-ASN.mmdb"))
    allowed_origins: list[str] = field(default_factory=lambda: _csv(os.getenv("ALLOWED_ORIGINS", "")))
    client_token: str = field(default_factory=lambda: os.getenv("CLIENT_TOKEN", ""))
    vt_per_minute: int = field(default_factory=lambda: int(os.getenv("VT_PER_MINUTE", "4")))
    vt_per_day: int = field(default_factory=lambda: int(os.getenv("VT_PER_DAY", "500")))
    timeout: float = field(default_factory=lambda: float(os.getenv("PROVIDER_TIMEOUT_SECONDS", "2.0")))
    domain_ttl: int = 24 * 3600
    ip_ttl: int = 6 * 3600
