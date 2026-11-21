import json
import os
import re
from urllib.parse import urlsplit
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import Field
from typing import Annotated, Literal
from .models import Canvas, Strict, Text
from .store import Store

router = APIRouter()


class Message(Strict):
    role: Literal["user", "assistant"]
    content: Annotated[str, Field(max_length=300000)]


class ChatRequest(Strict):
    messages: Annotated[list[Message], Field(min_length=1, max_length=50)]


def upstream():
    url = os.environ.get("ATLAS_HERMES_URL", "http://127.0.0.1:8642/v1").rstrip("/")
    parts = urlsplit(url)
    if parts.scheme not in {"http", "https"} or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment:
        raise HTTPException(503, "ATLAS_HERMES_URL inválida.")
    if parts.scheme == "http" and parts.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise HTTPException(503, "Use HTTPS para conectar a um Hermes remoto.")
    key = os.environ.get("ATLAS_HERMES_API_KEY", "")
    return url, {"Authorization": f"Bearer {key}"} if key else {}


@router.get("/status")
async def status():
    url, headers = upstream()
    try:
        async with httpx.AsyncClient(timeout=3, follow_redirects=False) as client:
            response = await client.get(url + "/models", headers=headers)
            response.raise_for_status()
        return {"connected": True, "mode": "hermes", "version": "0.1.0"}
    except httpx.HTTPError:
        return {"connected": False, "mode": "offline", "version": "0.1.0"}


@router.get("/canvases")
def canvases():
    return Store().list()


@router.get("/canvases/{id}")
def get_canvas(id: str, revision: int | None = None):
    result = Store().get(id, revision)
    if not result:
        raise HTTPException(404, "Canvas não encontrado.")
    return result


@router.post("/canvases")
def save_canvas(canvas: Canvas):
    try:
        return Store().save(canvas)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/chat")
async def chat(body: ChatRequest):
    url, headers = upstream()
    instructions = (
        "You are Hermes Atlas. Reply in the user's language. Use concise text. "
        "When interactive UI helps, return exactly one ```atlas fenced JSON block matching this schema. "
        "Never include executable code, HTML, URLs or invented factual data. Label illustrative data. "
        "Use stable canvas ids when revising an existing canvas. Plain text is fine when UI adds no value. "
        "Calculator compound inputs: principal, annual percent, years. split inputs: total, people. "
        + json.dumps(Canvas.model_json_schema(), ensure_ascii=False)
    )
    payload = {"model": "hermes-agent", "stream": False,
               "messages": [{"role": "system", "content": instructions}] + [m.model_dump() for m in body.messages]}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(180, connect=5), follow_redirects=False) as client:
            async with client.stream("POST", url + "/chat/completions", headers=headers, json=payload) as response:
                response.raise_for_status()
                data = bytearray()
                async for chunk in response.aiter_bytes():
                    data.extend(chunk)
                    if len(data) > 2_000_000:
                        raise HTTPException(502, "Resposta do Hermes excedeu o limite de 2 MB.")
        result = json.loads(data)
        choice = result["choices"][0]
        if choice.get("finish_reason") in {"error", "cancelled"}:
            raise HTTPException(502, "O Hermes interrompeu ou não concluiu esta resposta.")
        content = choice["message"].get("content") or ""
        if not isinstance(content, str):
            raise ValueError("Invalid message content")
    except httpx.TimeoutException as exc:
        raise HTTPException(504, "O Hermes excedeu 180 segundos. Confira o gateway antes de tentar novamente.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Não foi possível conversar com o Hermes. Confira a API, a chave e o gateway.") from exc
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise HTTPException(502, "Resposta incompatível recebida do Hermes.") from exc
    match = re.search(r"```atlas\s*\n(.*?)```", content, re.DOTALL)
    record, warning = None, None
    if match:
        try:
            record = Store().save(Canvas.model_validate_json(match.group(1)))
            content = content[:match.start()] + content[match.end():]
        except ValueError:
            warning = "O Hermes retornou um canvas inválido. O conteúdo foi preservado como texto."
    if choice.get("finish_reason") == "length":
        warning = "O Hermes atingiu o limite de execução; a resposta pode estar incompleta."
    return {"text": content.strip(), "artifact": record, "warning": warning}
