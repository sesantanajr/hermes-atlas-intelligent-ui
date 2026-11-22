"""Loopback-only standalone host. Dashboard deployment uses Hermes auth instead."""
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware
from .api import router
from . import gateway, runs

@asynccontextmanager
async def lifespan(app):
    yield
    await runs.shutdown()
    await gateway.close()

app = FastAPI(title="Hermes Atlas", docs_url=None, redoc_url=None, lifespan=lifespan)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "[::1]"])


@app.middleware("http")
async def local_guard(request: Request, call_next):
    origin = request.headers.get("origin")
    expected = str(request.base_url).rstrip("/")
    if request.method not in {"GET", "HEAD"}:
        if request.headers.get("sec-fetch-site") == "cross-site" or (origin and origin != expected):
            return JSONResponse({"detail": "Origin rejected"}, status_code=403)
        if "application/json" not in request.headers.get("content-type", ""):
            return JSONResponse({"detail": "JSON required"}, status_code=415)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; media-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"
    return response

app.include_router(router, prefix="/api/plugins/hermes-atlas")
dist = Path(__file__).resolve().parent.parent / "static"
if dist.is_dir():
    app.mount("/", StaticFiles(directory=dist, html=True), name="ui")


def serve(port=7331):
    """Run the standalone app. It binds to loopback only: there is no login of its own."""
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    serve()
