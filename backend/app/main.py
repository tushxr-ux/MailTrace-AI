from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .cache import TTLCache
from .config import Settings
from .routers import lookup, whitelist
from .services.virustotal import RateLimiter
from .services.whitelist import WhitelistStore, load_demo_cache


def create_app(settings: Settings | None = None, transport: httpx.AsyncBaseTransport | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.http = httpx.AsyncClient(timeout=settings.timeout, transport=transport,
                                           headers={"User-Agent": "MailTraceAI/0.1 (+lookup-only)"})
        yield
        await app.state.http.aclose()

    app = FastAPI(title="MailTrace AI — lookup API", version="0.1.0", lifespan=lifespan,
                  description="Lookups only. Receives a domain or an IP — never email content or user identity.")
    app.state.settings = settings
    app.state.cache = TTLCache()
    app.state.vt_limiter = RateLimiter(settings.vt_per_minute, settings.vt_per_day)
    app.state.whitelist = WhitelistStore()
    app.state.demo_cache = load_demo_cache()

    if settings.allowed_origins:
        app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins,
                           allow_methods=["GET", "POST"], allow_headers=["content-type", "x-client-token"])

    @app.get("/v1/health", tags=["meta"])
    async def health():
        return {"status": "ok"}

    app.include_router(lookup.router)
    app.include_router(whitelist.router)
    return app


app = create_app()
