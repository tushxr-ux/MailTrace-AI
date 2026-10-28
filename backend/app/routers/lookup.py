import asyncio

import httpx
from fastapi import APIRouter, Depends, Request

from ..models import DomainIntel, DomainReq, IpIntel, IpReq, UrlsReq
from ..services import abuseipdb, geoip, rdap, virustotal

router = APIRouter(prefix="/v1/lookup", tags=["lookup"])


def _st(request: Request):
    return request.app.state


async def _guard(request: Request) -> None:
    from fastapi import HTTPException

    token = _st(request).settings.client_token
    if token and request.headers.get("x-client-token") != token:
        raise HTTPException(status_code=401, detail="invalid client token")


async def lookup_domain(st, domain: str, *, with_rdap: bool = True) -> DomainIntel:
    wl = st.whitelist.contains(domain)
    if domain in st.demo_cache:
        return DomainIntel(domain=domain, inWhitelist=wl, source="demo", **st.demo_cache[domain])
    key = f"d:{domain}"
    cached = st.cache.get(key)
    if cached:
        return DomainIntel(**{**cached, "source": "cache"})

    s = st.settings
    http: httpx.AsyncClient = st.http
    tasks = {
        "rdap": rdap.domain_age(http, domain) if with_rdap else None,
        "vt": virustotal.domain_reputation(http, st.vt_limiter, s.vt_api_key, domain),
    }
    names = [k for k, v in tasks.items() if v is not None]
    results = await asyncio.gather(*[tasks[k] for k in names], return_exceptions=True)

    data: dict = {"domain": domain, "inWhitelist": wl, "source": "live"}
    degraded = False
    for name, res in zip(names, results):
        if isinstance(res, Exception):  # provider down / rate-limited / no key → partial data, never a 500
            degraded = True
        else:
            data.update(res)
    data["degraded"] = degraded
    # partial results are cached briefly so a rate-limited provider isn't hammered
    st.cache.set(key, data, 300 if degraded else s.domain_ttl)
    return DomainIntel(**data)


@router.post("/domain", response_model=DomainIntel, dependencies=[Depends(_guard)])
async def post_domain(req: DomainReq, request: Request):
    return await lookup_domain(_st(request), req.domain)


@router.post("/ip", response_model=IpIntel, response_model_exclude_none=True, dependencies=[Depends(_guard)])
async def post_ip(req: IpReq, request: Request):
    st = _st(request)
    key = f"i:{req.ip}"
    base = st.cache.get(key)
    if base is None:
        base = {"ip": req.ip}
        degraded = False
        try:
            base.update(await abuseipdb.ip_reputation(st.http, st.settings.abuseipdb_api_key, req.ip))
        except Exception:
            degraded = True
        base.update(geoip.locate(st.settings.geolite_city_path, st.settings.geolite_asn_path, req.ip))
        base["degraded"] = degraded
        st.cache.set(key, base, 300 if degraded else st.settings.ip_ttl)
    out = dict(base)
    if req.plan != "premium":  # geolocation is a premium-only field (spec §5.2)
        for k in ("country", "city", "asn", "isp", "lat", "lon"):
            out.pop(k, None)
    return IpIntel(**out)


@router.post("/urls", response_model=list[DomainIntel], dependencies=[Depends(_guard)])
async def post_urls(req: UrlsReq, request: Request):
    st = _st(request)
    return await asyncio.gather(*[lookup_domain(st, d, with_rdap=False) for d in req.domains])
