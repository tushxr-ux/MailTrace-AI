import json
from pathlib import Path

_DATA = Path(__file__).resolve().parents[2] / "data"


class WhitelistStore:
    def __init__(self) -> None:
        raw = json.loads((_DATA / "whitelist.json").read_text())
        self.version: str = raw["version"]
        self.domains: set[str] = set(raw["domains"])
        self.suffixes: list[str] = raw["trustedSuffixes"]

    def contains(self, domain: str) -> bool:
        return domain in self.domains or any(domain == s or domain.endswith("." + s) for s in self.suffixes)

    def as_dict(self) -> dict:
        return {"version": self.version, "domains": sorted(self.domains), "trustedSuffixes": self.suffixes}


def load_demo_cache() -> dict:
    p = _DATA / "demo_cache.json"
    if not p.exists():
        return {}
    return {k: v for k, v in json.loads(p.read_text()).items() if not k.startswith("_")}
