import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def provider_transport(rdap_age_days: int | None = 3, vt_malicious: int = 5, fail: set[str] = frozenset()):
    """Mock every upstream provider so tests are hermetic."""
    from datetime import datetime, timedelta, timezone

    def handler(req: httpx.Request) -> httpx.Response:
        host = req.url.host
        if host == "rdap.org":
            if "rdap" in fail:
                return httpx.Response(503)
            ev = []
            if rdap_age_days is not None:
                ev = [{"eventAction": "registration", "eventDate": (datetime.now(timezone.utc) - timedelta(days=rdap_age_days)).isoformat()}]
            return httpx.Response(200, json={"events": ev, "entities": [{"roles": ["registrar"], "vcardArray": ["vcard", [["fn", {}, "text", "NameCheap"]]]}]})
        if host == "www.virustotal.com":
            if "vt" in fail:
                return httpx.Response(429)
            return httpx.Response(200, json={"data": {"attributes": {"last_analysis_stats": {"malicious": vt_malicious, "suspicious": 1}}}})
        if host == "api.abuseipdb.com":
            if "abuse" in fail:
                return httpx.Response(500)
            return httpx.Response(200, json={"data": {"abuseConfidenceScore": 77, "totalReports": 40, "isp": "Example ISP"}})
        return httpx.Response(404)

    return httpx.MockTransport(handler)


def client(**kw) -> TestClient:
    s = Settings(vt_api_key="k", abuseipdb_api_key="k", geolite_city_path="/nonexistent", geolite_asn_path="/nonexistent")
    for k, v in kw.pop("settings", {}).items():
        setattr(s, k, v)
    return TestClient(create_app(s, provider_transport(**kw)))


def test_health():
    with client() as c:
        assert c.get("/v1/health").json() == {"status": "ok"}


def test_domain_lookup_live():
    with client() as c:
        r = c.post("/v1/lookup/domain", json={"domain": "Fresh-Scam.XYZ"})
        assert r.status_code == 200
        j = r.json()
        assert j["domain"] == "fresh-scam.xyz"
        assert j["ageDays"] == 3 and j["vtMalicious"] == 5 and j["degraded"] is False and j["source"] == "live"
        assert c.post("/v1/lookup/domain", json={"domain": "fresh-scam.xyz"}).json()["source"] == "cache"


def test_domain_rejects_anything_that_identifies_a_user_or_message():
    with client() as c:
        for bad in ["me@example.com", "https://example.com/path", "example.com/x", "localhost", "a b.com", ""]:
            assert c.post("/v1/lookup/domain", json={"domain": bad}).status_code == 422, bad


def test_provider_failure_returns_partial_not_500():
    with client(fail={"vt"}) as c:
        j = c.post("/v1/lookup/domain", json={"domain": "partial.example"}).json()
        assert j["degraded"] is True and j["ageDays"] == 3 and j["vtMalicious"] is None
    with client(fail={"rdap", "vt"}) as c:
        j = c.post("/v1/lookup/domain", json={"domain": "alldown.example"}).json()
        assert j["degraded"] is True and j["ageDays"] is None


def test_rdap_without_creation_date_is_unknown_not_zero():
    with client(rdap_age_days=None) as c:
        j = c.post("/v1/lookup/domain", json={"domain": "hidden.example"}).json()
        assert j["ageDays"] is None and j["degraded"] is False


def test_demo_cache_short_circuits_providers():
    with client(fail={"vt", "rdap"}) as c:
        j = c.post("/v1/lookup/domain", json={"domain": "amaz0n-security.com"}).json()
        assert j["source"] == "demo" and j["ageDays"] == 3 and j["vtMalicious"] == 11 and j["degraded"] is False


def test_whitelist_flag():
    with client() as c:
        assert c.post("/v1/lookup/domain", json={"domain": "amazon.in"}).json()["inWhitelist"] is True
        assert c.post("/v1/lookup/domain", json={"domain": "iitb.ac.in"}).json()["inWhitelist"] is True
        assert c.post("/v1/lookup/domain", json={"domain": "random-shop.io"}).json()["inWhitelist"] is False


def test_vt_rate_limit_falls_back():
    with client(settings={"vt_per_minute": 1}) as c:
        a = c.post("/v1/lookup/domain", json={"domain": "one.example"}).json()
        b = c.post("/v1/lookup/domain", json={"domain": "two.example"}).json()
        assert a["degraded"] is False and b["degraded"] is True and b["ageDays"] == 3


def test_ip_geo_is_premium_only_and_private_ips_rejected():
    with client() as c:
        free = c.post("/v1/lookup/ip", json={"ip": "45.33.32.156"}).json()
        assert free["abuseScore"] == 77 and "country" not in free
        assert c.post("/v1/lookup/ip", json={"ip": "10.0.0.1"}).status_code == 422
        assert c.post("/v1/lookup/ip", json={"ip": "127.0.0.1"}).status_code == 422
        assert c.post("/v1/lookup/ip", json={"ip": "nope"}).status_code == 422


def test_ip_provider_down_is_degraded():
    with client(fail={"abuse"}) as c:
        j = c.post("/v1/lookup/ip", json={"ip": "185.220.101.4"}).json()
        assert j["degraded"] is True


def test_urls_batch_dedupes_and_caps():
    with client() as c:
        r = c.post("/v1/lookup/urls", json={"domains": ["a.example", "A.example", "b.example"]})
        assert [x["domain"] for x in r.json()] == ["a.example", "b.example"]
        assert c.post("/v1/lookup/urls", json={"domains": [f"d{i}.example" for i in range(21)]}).status_code == 422


def test_whitelist_endpoint_with_etag():
    with client() as c:
        r = c.get("/v1/whitelist")
        assert r.status_code == 200 and "amazon.in" in r.json()["domains"]
        etag = r.headers["etag"]
        assert c.get("/v1/whitelist", headers={"if-none-match": etag}).status_code == 304


def test_client_token_enforced_when_configured():
    with client(settings={"client_token": "s3cret"}) as c:
        assert c.post("/v1/lookup/domain", json={"domain": "x.example"}).status_code == 401
        assert c.post("/v1/lookup/domain", json={"domain": "x.example"}, headers={"x-client-token": "s3cret"}).status_code == 200
