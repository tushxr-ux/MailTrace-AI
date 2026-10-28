import hashlib
import json

from fastapi import APIRouter, Request, Response

router = APIRouter(prefix="/v1", tags=["whitelist"])


@router.get("/whitelist")
async def get_whitelist(request: Request, response: Response, org: str = "aicte"):
    payload = request.app.state.whitelist.as_dict()
    etag = '"' + hashlib.sha1(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:16] + '"'
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag})
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "public, max-age=3600"
    return {"org": org, **payload}
