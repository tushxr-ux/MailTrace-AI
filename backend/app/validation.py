import ipaddress
import re

_DOMAIN_RE = re.compile(r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")


def clean_domain(value: str) -> str:
    """Accept ONLY a bare domain. Anything that looks like an email/URL/path is rejected —
    this endpoint must never receive anything that identifies a user or message."""
    d = value.strip().lower().rstrip(".")
    try:
        d = d.encode("idna").decode("ascii")
    except UnicodeError as e:
        raise ValueError("invalid domain") from e
    if not _DOMAIN_RE.match(d):
        raise ValueError("invalid domain")
    return d


def clean_ip(value: str) -> str:
    ip = ipaddress.ip_address(value.strip())
    if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
        raise ValueError("non-public IP")
    return str(ip)
