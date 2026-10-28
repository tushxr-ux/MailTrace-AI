from typing import Literal

from pydantic import BaseModel, Field, field_validator

from .validation import clean_domain, clean_ip

Plan = Literal["free", "premium"]


class DomainReq(BaseModel):
    domain: str

    @field_validator("domain")
    @classmethod
    def _v(cls, v: str) -> str:
        return clean_domain(v)


class IpReq(BaseModel):
    ip: str
    plan: Plan = "free"

    @field_validator("ip")
    @classmethod
    def _v(cls, v: str) -> str:
        return clean_ip(v)


class UrlsReq(BaseModel):
    domains: list[str] = Field(min_length=1, max_length=20)

    @field_validator("domains")
    @classmethod
    def _v(cls, v: list[str]) -> list[str]:
        return list(dict.fromkeys(clean_domain(d) for d in v))


class DomainIntel(BaseModel):
    domain: str
    ageDays: int | None = None
    createdAt: str | None = None
    registrar: str | None = None
    vtMalicious: int | None = None
    vtSuspicious: int | None = None
    inWhitelist: bool = False
    degraded: bool = False
    source: Literal["live", "cache", "demo"] = "live"


class IpIntel(BaseModel):
    ip: str
    abuseScore: int | None = None
    reports: int | None = None
    country: str | None = None
    city: str | None = None
    asn: str | None = None
    isp: str | None = None
    lat: float | None = None
    lon: float | None = None
    degraded: bool = False
