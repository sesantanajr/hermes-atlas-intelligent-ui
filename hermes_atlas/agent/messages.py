"""User-facing text of ``/atlas`` and ``hermes atlas``, in Portuguese and English."""

_TEXT = {
    "pt": {
        "title": "Hermes Atlas {version}",
        "library": "Biblioteca: {canvases} canvas(es), {revisions} versão(ões), {conversations} conversa(s) do Atlas",
        "data": "Dados: {path}",
        "profile": "Perfil: {profile}",
        "empty": "A biblioteca está vazia. Peça ao Hermes algo visual, por exemplo: \"monte um orçamento de viagem interativo\".",
        "recent": "Canvases recentes:",
        "row": "- {title} · v{revision} · {updated} · id {id}",
        "none_found": "Nenhum canvas encontrado para \"{query}\".",
        "not_found": "Não encontrei um canvas com \"{query}\". Use /atlas list para ver os ids.",
        "exported": "Arquivo gerado: {path}",
        "usage": (
            "Uso:\n"
            "/atlas — resumo e canvases recentes\n"
            "/atlas list [texto] — buscar por título\n"
            "/atlas show <id ou título> [versão] — ver o canvas em texto\n"
            "/atlas export <id ou título> [html|md|json] — gerar um arquivo\n"
            "/atlas help — esta ajuda"),
        "open_hint": "Abra o Atlas no Hermes Desktop ou no dashboard para interagir com os canvases.",
        "error": "Atlas: não foi possível concluir ({detail}).",
        "bad_format": "Formato inválido. Use html, md ou json.",
        "ok": "ok", "fail": "FALHA", "warn": "aviso",
        "doctor_title": "Diagnóstico do Hermes Atlas {version}",
        "doctor_ok": "Tudo certo.", "doctor_bad": "{count} problema(s) encontrado(s).",
        "serve": "Atlas em http://{host}:{port} (Ctrl+C para encerrar)",
        "serve_missing": "A interface independente não está neste pacote (hermes_atlas/static ausente). Gere com: npm ci && npm run build",
        "connected": "Gateway Hermes: conectado ({model})",
        "disconnected": "Gateway Hermes: indisponível ({detail})",
    },
    "en": {
        "title": "Hermes Atlas {version}",
        "library": "Library: {canvases} canvas(es), {revisions} revision(s), {conversations} Atlas conversation(s)",
        "data": "Data: {path}",
        "profile": "Profile: {profile}",
        "empty": "The library is empty. Ask Hermes for something visual, for example: \"build an interactive trip budget\".",
        "recent": "Recent canvases:",
        "row": "- {title} · v{revision} · {updated} · id {id}",
        "none_found": "No canvas found for \"{query}\".",
        "not_found": "No canvas matches \"{query}\". Use /atlas list to see the ids.",
        "exported": "File written: {path}",
        "usage": (
            "Usage:\n"
            "/atlas — summary and recent canvases\n"
            "/atlas list [text] — search by title\n"
            "/atlas show <id or title> [revision] — read the canvas as text\n"
            "/atlas export <id or title> [html|md|json] — write a file\n"
            "/atlas help — this help"),
        "open_hint": "Open Atlas in Hermes Desktop or the dashboard to interact with the canvases.",
        "error": "Atlas: could not complete ({detail}).",
        "bad_format": "Invalid format. Use html, md or json.",
        "ok": "ok", "fail": "FAIL", "warn": "warning",
        "doctor_title": "Hermes Atlas {version} diagnostics",
        "doctor_ok": "All good.", "doctor_bad": "{count} problem(s) found.",
        "serve": "Atlas at http://{host}:{port} (Ctrl+C to stop)",
        "serve_missing": "The standalone interface is not in this package (hermes_atlas/static is missing). Build it with: npm ci && npm run build",
        "connected": "Hermes gateway: connected ({model})",
        "disconnected": "Hermes gateway: unavailable ({detail})",
    },
}


def text(locale, key, **values):
    table = _TEXT["en" if locale == "en" else "pt"]
    return table[key].format(**values) if values else table[key]
