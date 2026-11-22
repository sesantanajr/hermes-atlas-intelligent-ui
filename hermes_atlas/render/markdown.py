"""Render a canvas as Markdown for surfaces that cannot show the interactive UI.

Used by ``/atlas show``, ``hermes atlas show``, the Markdown export and the text preview the
agent can read back. Input is the stored canvas JSON (a plain ``dict``); nothing here imports the
schema models, and a malformed block degrades to its title instead of raising.

``tables=False`` writes lists instead of pipe tables, for chat platforms that do not draw them.
"""
import json
import math

_WORDS = {
    "pt": {
        "sources": "Fontes", "result": "Resultado", "undefined": "indefinido", "done": "concluídos",
        "of": "de", "selected": "selecionado", "required": "obrigatório", "options": "opções",
        "answer": "Resposta", "your_answer": "Sua resposta", "correct": "correta", "incorrect": "incorreta",
        "explanation": "Explicação", "known": "já sei", "transcript": "Transcrição", "total": "Total",
        "limit": "Limite", "balance": "Saldo", "unavailable": "indisponível", "start": "Início",
        "on": "ligado", "off": "desligado", "vote": "voto", "empty": "sem resposta", "path": "Caminho",
        "period": "Período", "truncated": "… (conteúdo resumido; abra o canvas no Atlas para ver tudo)",
        "blocks": "blocos", "image": "Imagem", "video": "Vídeo", "audio": "Áudio", "stops": "paradas",
        "from": "de", "to": "até", "seconds": "s", "by": "por", "draft": "rascunho",
    },
    "en": {
        "sources": "Sources", "result": "Result", "undefined": "undefined", "done": "done",
        "of": "of", "selected": "selected", "required": "required", "options": "options",
        "answer": "Answer", "your_answer": "Your answer", "correct": "correct", "incorrect": "incorrect",
        "explanation": "Explanation", "known": "known", "transcript": "Transcript", "total": "Total",
        "limit": "Limit", "balance": "Balance", "unavailable": "unavailable", "start": "Start",
        "on": "on", "off": "off", "vote": "vote", "empty": "no answer", "path": "Path",
        "period": "Period", "truncated": "… (shortened; open the canvas in Atlas to see everything)",
        "blocks": "blocks", "image": "Image", "video": "Video", "audio": "Audio", "stops": "stops",
        "from": "from", "to": "to", "seconds": "s", "by": "by", "draft": "draft",
    },
}
_CURRENCY = {"BRL": "R$", "EUR": "€", "USD": "$", "GBP": "£"}


def _locale(locale):
    return "en" if str(locale or "").lower().startswith("en") else "pt"


class _Writer:
    def __init__(self, locale, tables):
        self.lang = _locale(locale)
        self.words = _WORDS[self.lang]
        self.tables = tables
        self.lines = []

    def t(self, key):
        return self.words[key]

    def add(self, *lines):
        self.lines.extend(lines)

    def number(self, value, unit=""):
        if value is None:
            return "—"
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            return str(value)
        text = f"{value:,.2f}".rstrip("0").rstrip(".") if value != int(value) else f"{int(value):,}"
        if self.lang == "pt":
            text = text.replace(",", "\x00").replace(".", ",").replace("\x00", ".")
        return f"{text} {unit}".strip()

    def money(self, cents, currency):
        symbol = _CURRENCY.get(currency, currency or "")
        text = f"{(cents or 0) / 100:,.2f}"
        if self.lang == "pt":
            text = text.replace(",", "\x00").replace(".", ",").replace("\x00", ".")
        return f"{symbol} {text}".strip()

    def table(self, header, rows):
        rows = [[_cell(value) for value in row] for row in rows]
        if not rows:
            return
        if self.tables:
            self.add("| " + " | ".join(_cell(h) for h in header) + " |", "|" + "|".join(" --- " for _ in header) + "|")
            self.add(*("| " + " | ".join(row) + " |" for row in rows))
        else:
            for row in rows:
                pairs = [f"{h}: {v}" if h else v for h, v in zip(header[1:], row[1:]) if v != ""]
                self.add(f"- {row[0]}" + (" · " + "; ".join(pairs) if pairs else ""))

    def pairs(self, items, unit=""):
        for label, value in items:
            self.add(f"- {label}: {self.number(value, unit) if isinstance(value, (int, float)) or value is None else value}")

    def bullets(self, items):
        self.add(*(f"- {item}" for item in items))


def _cell(value):
    return str("" if value is None else value).replace("\n", " ").replace("|", "\\|")


def _items(block, key):
    value = block.get(key)
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _strings(block, key):
    value = block.get(key)
    return [str(item) for item in value] if isinstance(value, list) else []


def _values(state):
    values = state.get("values")
    return values if isinstance(values, dict) else {}


def _selection(raw):
    try:
        chosen = json.loads(raw) if isinstance(raw, str) else []
    except ValueError:
        return []
    return [item for item in chosen if isinstance(item, str)] if isinstance(chosen, list) else []


def _calculate(operation, numbers):
    try:
        if operation == "sum":
            return sum(numbers)
        if operation == "product":
            return math.prod(numbers)
        if operation == "split":
            return numbers[0] / numbers[1] if numbers[1] else None
        if operation == "compound":
            return numbers[0] * (1 + numbers[1] / 100) ** numbers[2]
    except (IndexError, OverflowError, TypeError, ZeroDivisionError):
        return None
    return None


def _sections(w, items, body_key="body", ordered=False, done=()):
    for index, item in enumerate(items, start=1):
        mark = f"{index}." if ordered else "-"
        check = " ✓" if item.get("id") in done else ""
        when = f" ({item['when']})" if item.get("when") else ""
        w.add(f"{mark} **{item.get('title', '')}**{when}{check}")
        if item.get(body_key):
            w.add(f"  {str(item[body_key]).strip()}")
        for point in _strings(item, "points"):
            w.add(f"  - {point}")


def _equation(expression):
    parts = []
    for atom in expression:
        kind = atom.get("kind")
        if kind == "text":
            parts.append(str(atom.get("text", "")))
        elif kind == "fraction":
            parts.append(f"({atom.get('numerator', '')})/({atom.get('denominator', '')})")
        elif kind == "power":
            parts.append(f"{atom.get('base', '')}^({atom.get('exponent', '')})")
        elif kind == "root":
            parts.append(f"√({atom.get('radicand', '')})")
    return " ".join(parts)


def _choice_label(options, chosen):
    return next((o.get("label", chosen) for o in options if o.get("id") == chosen), chosen)


def _block(w, block, state):
    kind = block.get("type", "")
    values = _values(state)
    unit = block.get("unit", "") if isinstance(block.get("unit"), str) else ""

    if kind == "text":
        w.add(str(block.get("text", "")))
    elif kind == "metric":
        w.add(f"**{block.get('value', '')}**" + (f" — {block['detail']}" if block.get("detail") else ""))
    elif kind in ("chart", "sparkline"):
        w.pairs([(p.get("label", ""), p.get("value")) for p in _items(block, "points")], unit)
    elif kind == "table":
        w.table(_strings(block, "columns"), [row for row in block.get("rows", []) if isinstance(row, list)])
    elif kind == "checklist":
        checked = set(state.get("checked") or [])
        items = _strings(block, "items")
        w.add(*(f"- [{'x' if index in checked else ' '}] {item}" for index, item in enumerate(items)))
    elif kind == "comparison":
        for index, option in enumerate(_items(block, "options")):
            chosen = f" ← {w.t('selected')}" if state.get("selected") == index else ""
            w.add(f"- **{option.get('name', '')}**{chosen}: {option.get('description', '')}")
            w.add(*(f"  - {feature}" for feature in _strings(option, "features")))
    elif kind == "collection":
        selected = set(state.get("selected_ids") or [])
        for item in _items(block, "items"):
            score = f" ({w.number(item['score'])}/100)" if isinstance(item.get("score"), (int, float)) else ""
            chosen = f" ← {w.t('selected')}" if item.get("id") in selected else ""
            w.add(f"- **{item.get('title', '')}**{score}{chosen}" +
                  (f": {item['description']}" if item.get("description") else ""))
            meta = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
            w.add(*(f"  - {key}: {value}" for key, value in meta.items()))
            source = item.get("source")
            if isinstance(source, dict) and source.get("url"):
                w.add(f"  - [{source.get('title', source['url'])}]({source['url']})")
    elif kind == "calculator":
        inputs = _items(block, "inputs")
        w.pairs([(i.get("label", ""), i.get("value")) for i in inputs])
        result = _calculate(block.get("operation"), [i.get("value", 0) for i in inputs])
        shown = w.t("undefined") if result is None else w.number(result, "")
        w.add(f"- **{w.t('result')}: {(unit + ' ' + shown).strip()}**")
    elif kind == "form":
        filled = state.get("fields") if isinstance(state.get("fields"), dict) else {}
        for field in _items(block, "fields"):
            note = f" ({w.t('required')})" if field.get("required") else ""
            options = _strings(field, "options")
            choices = f" [{w.t('options')}: {', '.join(options)}]" if options else ""
            answer = f" → {filled[field['id']]}" if filled.get(field.get("id")) else ""
            w.add(f"- {field.get('label', '')}{note}{choices}{answer}")
    elif kind == "series":
        datasets = _items(block, "datasets")
        hidden = set(state.get("hidden_series") or [])
        shown = [d for d in datasets if d.get("id") not in hidden] or datasets
        header = [""] + [d.get("label", "") + (f" ({unit})" if unit else "") for d in shown]
        rows = []
        for index, label in enumerate(_strings(block, "labels")):
            row = [label]
            for dataset in shown:
                series = dataset.get("values") if isinstance(dataset.get("values"), list) else []
                row.append(w.number(series[index] if index < len(series) else None))
            rows.append(row)
        w.table(header, rows)
    elif kind in ("tabs", "accordion", "columns", "carousel", "article", "cards"):
        if kind == "article":
            for key in ("byline", "lead"):
                if block.get(key):
                    w.add(f"*{block[key]}*")
        key = {"columns": "columns", "carousel": "slides", "article": "sections"}.get(kind, "items")
        _sections(w, _items(block, key))
    elif kind == "steps_list":
        _sections(w, _items(block, "steps"), ordered=True, done={k for k, v in values.items() if v == "1"})
    elif kind == "timeline":
        marks = {"done": "✓", "current": "▶", "upcoming": "○"}
        for item in _items(block, "items"):
            mark = marks.get(item.get("status"), "•")
            when = f"{item['when']} — " if item.get("when") else ""
            w.add(f"- {mark} {when}**{item.get('title', '')}**: {item.get('body', '')}")
            w.add(*(f"  - {point}" for point in _strings(item, "points")))
    elif kind == "diagram":
        w.add(f"*{block.get('alt', '')}*")
        _sections(w, _items(block, "items"))
    elif kind == "route":
        for index, stop in enumerate(_items(block, "items"), start=1):
            w.add(f"{index}. **{stop.get('title', '')}** ({stop.get('lat')}, {stop.get('lon')}): {stop.get('body', '')}")
    elif kind == "flashcards":
        known = set(state.get("known_ids") or [])
        for card in _items(block, "items"):
            mark = f" ({w.t('known')})" if card.get("id") in known else ""
            w.add(f"- **{card.get('question', '')}**{mark}", f"  {card.get('answer', '')}")
    elif kind in ("short_answer", "long_answer", "number_input", "date_picker"):
        answer = values.get("value") or w.t("empty")
        w.add(f"- {w.t('your_answer')}: {answer} {unit if kind == 'number_input' and values.get('value') else ''}".rstrip())
    elif kind == "date_range":
        w.add(f"- {w.t('from')} {values.get('start') or '—'} {w.t('to')} {values.get('end') or '—'}")
    elif kind in ("single_choice", "segmented", "poll", "quiz"):
        options = _items(block, "options")
        chosen = values.get("value") or values.get("choice")
        if kind == "quiz":
            w.add(str(block.get("question", "")))
        for option in options:
            mark = "x" if option.get("id") == chosen else " "
            detail = f" — {option['detail']}" if option.get("detail") else ""
            w.add(f"- ({mark}) {option.get('label', '')}{detail}")
        if kind == "quiz" and values.get("answer"):
            verdict = w.t("correct") if values["answer"] == block.get("answer_id") else w.t("incorrect")
            w.add(f"- {w.t('answer')}: {_choice_label(options, values['answer'])} ({verdict})",
                  f"- {w.t('explanation')}: {block.get('explanation', '')}")
    elif kind == "multi_choice":
        chosen = set(_selection(values.get("selected")))
        w.add(*(f"- [{'x' if o.get('id') in chosen else ' '}] {o.get('label', '')}" for o in _items(block, "options")))
    elif kind == "checklist_group":
        chosen = set(_selection(values.get("selected")))
        for group in _items(block, "groups"):
            w.add(f"**{group.get('label', '')}**")
            w.add(*(f"- [{'x' if t.get('id') in chosen else ' '}] {t.get('label', '')}" for t in _items(group, "tasks")))
    elif kind == "toggle":
        current = values.get("value", "true" if block.get("initial") else "false")
        w.add(f"- {w.t('on') if current == 'true' else w.t('off')}")
    elif kind == "slider":
        current = values.get("value", block.get("initial", block.get("min", 0)))
        w.add(f"- {current} {unit}".rstrip() + f" ({block.get('min', 0)}–{block.get('max', 100)})")
    elif kind == "rating":
        stars = block.get("stars", 5)
        score = int(values["value"]) if str(values.get("value", "")).isdigit() else 0
        w.add("- " + "★" * score + "☆" * max(0, stars - score))
    elif kind == "timer":
        w.add(f"- {block.get('seconds', 0)} {w.t('seconds')}")
    elif kind in ("pie", "donut", "treemap", "funnel", "ranking"):
        items = _items(block, "items")
        total = sum(i.get("value") or 0 for i in items)
        share = kind in ("pie", "donut", "treemap") and total > 0
        for index, item in enumerate(items, start=1):
            label = f"{index}. {item.get('label', '')}" if kind == "ranking" else f"- {item.get('label', '')}"
            percent = f" ({(item.get('value') or 0) / total * 100:.0f}%)" if share else ""
            w.add(f"{label}: {w.number(item.get('value'), unit)}{percent}")
    elif kind == "waterfall":
        running = block.get("start", 0) or 0
        w.add(f"- {w.t('start')}: {w.number(running, unit)}")
        for item in _items(block, "items"):
            delta = item.get("value") or 0
            running += delta
            w.add(f"- {item.get('label', '')}: {'+' if delta >= 0 else ''}{w.number(delta, unit)} → {w.number(running, unit)}")
    elif kind in ("scatter", "bubble"):
        header = ["", block.get("x_label", "x"), block.get("y_label", "y")] + (["size"] if kind == "bubble" else [])
        w.table(header, [[p.get("label", ""), w.number(p.get("x")), w.number(p.get("y"))] +
                         ([w.number(p.get("size"))] if kind == "bubble" else []) for p in _items(block, "points")])
    elif kind == "radar":
        w.add(*(f"- {a.get('label', '')}: {w.number(a.get('value'))} / {w.number(a.get('max'))}" for a in _items(block, "axes")))
    elif kind == "heatmap":
        columns = _strings(block, "columns")
        matrix = block.get("values") if isinstance(block.get("values"), list) else []
        rows = [[label] + [w.number(v) for v in (matrix[index] if index < len(matrix) else [])]
                for index, label in enumerate(_strings(block, "rows"))]
        w.table([unit] + columns, rows)
    elif kind == "histogram":
        samples = [s for s in block.get("samples", []) if isinstance(s, (int, float))]
        if samples:
            w.add(f"- n = {len(samples)}; min {w.number(min(samples), unit)}; max {w.number(max(samples), unit)}; "
                  f"mean {w.number(sum(samples) / len(samples), unit)}")
    elif kind == "gauge":
        w.add(f"- {w.number(block.get('value'), unit)} ({w.number(block.get('min', 0))}–{w.number(block.get('max', 100))})")
    elif kind == "progress":
        done, total = block.get("completed") or 0, block.get("total") or 0
        percent = f" ({done / total * 100:.0f}%)" if total else ""
        w.add(f"- {w.number(done, unit)} {w.t('of')} {w.number(total, unit)}{percent}")
    elif kind == "dashboard":
        periods = _items(block, "periods")
        active = next((p for p in periods if p.get("id") == values.get("period")), periods[0] if periods else {})
        w.add(f"*{w.t('period')}: {active.get('label', '')}*")
        w.add(*(f"- {m.get('label', '')}: {w.number(m.get('value'), m.get('unit', ''))}" for m in _items(active, "metrics")))
        w.add(f"**{block.get('breakdown_label', '')}**")
        w.add(*(f"- {p.get('label', '')}: {w.number(p.get('value'), unit)}" for p in _items(active, "breakdown")))
    elif kind == "heading":
        if block.get("subtitle"):
            w.add(str(block["subtitle"]))
    elif kind == "callout":
        w.add(f"> {str(block.get('body', '')).strip()}")
    elif kind == "quote":
        source = f" ({block['url']})" if block.get("url") else ""
        w.add(f"> {str(block.get('quote', '')).strip()}", f"> — {block.get('attribution', '')}{source}")
    elif kind == "glossary":
        w.add(*(f"- **{e.get('term', '')}**: {e.get('definition', '')}" for e in _items(block, "entries")))
    elif kind == "code":
        w.add("```" + str(block.get("language", "")), str(block.get("code", "")), "```")
    elif kind == "markdown":
        w.add(str(block.get("body", "")))
    elif kind == "equation":
        w.add(f"`{_equation(_items(block, 'expression'))}`", str(block.get("description", "")))
    elif kind == "badges":
        w.add(" · ".join(b.get("label", "") for b in _items(block, "items")))
    elif kind == "facts":
        w.add(*(f"- {e.get('label', '')}: {e.get('value', '')}" for e in _items(block, "entries")))
    elif kind == "bibliography":
        for index, ref in enumerate(_items(block, "entries"), start=1):
            who = f"{ref['author']}. " if ref.get("author") else ""
            where = f" {ref['locator']}." if ref.get("locator") else ""
            w.add(f"{index}. {who}[{ref.get('title', '')}]({ref.get('url', '')}).{where}")
    elif kind == "entity":
        w.add(f"**{block.get('name', '')}** — {block.get('category', '')}", str(block.get("summary", "")))
        w.add(*(f"- {a.get('label', '')}: {a.get('value', '')}" for a in _items(block, "attributes")))
        if block.get("url"):
            w.add(str(block["url"]))
    elif kind == "document":
        body = values.get("draft")
        w.add(str(body if body is not None else block.get("body", "")))
    elif kind in ("image", "gallery"):
        photos = [block.get("photo")] if kind == "image" else block.get("photos", [])
        for photo in (p for p in photos if isinstance(p, dict)):
            link = f" ({photo['src']})" if str(photo.get("src", "")).startswith("https://") else ""
            caption = f" — {photo['caption']}" if photo.get("caption") else ""
            w.add(f"- {w.t('image')}: {photo.get('alt', '')}{caption}{link}")
    elif kind in ("video", "audio"):
        link = f" {block['src']}" if str(block.get("src", "")).startswith("https://") else ""
        w.add(f"- {w.t(kind)}:{link}".rstrip(":"), f"- {w.t('transcript')}: {block.get('transcript', '')}")
    elif kind in ("map", "places"):
        for place in _items(block, "pins" if kind == "map" else "places"):
            address = f" — {place['address']}" if place.get("address") else ""
            category = f" [{place['category']}]" if place.get("category") else ""
            detail = f": {place['detail']}" if place.get("detail") else ""
            w.add(f"- **{place.get('label', '')}**{category}{address} ({place.get('lat')}, {place.get('lon')}){detail}")
    elif kind == "product":
        w.add(str(block.get("description", "")))
        for variant in _items(block, "variants"):
            chosen = f" ← {w.t('selected')}" if values.get("variant") == variant.get("id") else ""
            stock = "" if variant.get("available", True) else f" ({w.t('unavailable')})"
            w.add(f"- {variant.get('label', '')}: {w.money(variant.get('price_cents'), block.get('currency'))}{stock}{chosen}")
    elif kind == "kanban":
        tasks = _items(block, "tasks")
        for column in _items(block, "columns"):
            w.add(f"**{column.get('label', '')}**")
            mine = [t for t in tasks if values.get(t.get("id"), t.get("column")) == column.get("id")]
            w.add(*(f"- {task.get('label', '')}" for task in mine))
    elif kind == "decision_tree":
        nodes = {node.get("id"): node for node in _items(block, "nodes")}
        path = [step for step in str(values.get("path", "")).split(",") if step in nodes]
        if path:
            w.add(f"{w.t('path')}: " + " → ".join(nodes[step].get("label", step) for step in path))
        for node in nodes.values():
            w.add(f"- **{node.get('label', '')}**")
            w.add(*(f"  - {c.get('label', '')} → {nodes.get(c.get('target'), {}).get('label', c.get('target', ''))}"
                    for c in _items(node, "choices")))
    elif kind == "budget_planner":
        currency, total = block.get("currency"), 0
        for line in _items(block, "items"):
            raw = values.get(line.get("id"))
            quantity = int(raw) if isinstance(raw, str) and raw.isdigit() else line.get("quantity", 1)
            subtotal = (line.get("price_cents") or 0) * quantity
            total += subtotal
            w.add(f"- {quantity} × {line.get('label', '')}: {w.money(subtotal, currency)}")
        limit = block.get("limit_cents") or 0
        w.add(f"- **{w.t('total')}: {w.money(total, currency)}** · {w.t('limit')}: {w.money(limit, currency)} · "
              f"{w.t('balance')}: {w.money(limit - total, currency)}")


def render_block(block, state=None, *, locale="pt", tables=True, level=2):
    """Markdown for one block, heading included."""
    w = _Writer(locale, tables)
    title = str(block.get("title", "")).strip()
    kind = block.get("type", "")
    depth = min(6, max(1, block.get("level", 3) if kind == "heading" else level))
    w.add("#" * depth + " " + title if title else "")
    try:
        _block(w, block, state if isinstance(state, dict) else {})
    except (AttributeError, IndexError, KeyError, TypeError, ValueError):
        pass  # a malformed stored block still shows its title
    return "\n".join(line for line in w.lines if line is not None).strip()


def render_canvas(canvas, *, locale="pt", tables=True, max_chars=0, revision=None):
    """Markdown for a whole canvas. ``max_chars`` (0 = unlimited) shortens at a block boundary."""
    w = _Writer(locale, tables)
    states = canvas.get("state") if isinstance(canvas.get("state"), dict) else {}
    head = f"# {canvas.get('title', 'Canvas')}" + (f" (v{revision})" if revision else "")
    parts = [head]
    if canvas.get("description"):
        parts.append(str(canvas["description"]).strip())
    blocks = [b for b in canvas.get("blocks", []) if isinstance(b, dict)]
    used = sum(len(p) + 2 for p in parts)
    for index, block in enumerate(blocks):
        text = render_block(block, states.get(block.get("id")), locale=locale, tables=tables)
        if max_chars and used + len(text) > max_chars and index:
            parts.append(f"{w.t('truncated')} [{len(blocks) - index} {w.t('blocks')}]")
            break
        parts.append(text)
        used += len(text) + 2
    sources = [s for s in canvas.get("sources", []) if isinstance(s, dict) and s.get("url")]
    if sources:
        listing = "\n".join(f"{i}. [{s.get('title', s['url'])}]({s['url']})" for i, s in enumerate(sources, start=1))
        parts.append(f"## {w.t('sources')}\n{listing}")
    text = "\n\n".join(part for part in parts if part)
    if max_chars and len(text) > max_chars + 400:
        text = text[:max_chars].rstrip() + "\n\n" + w.t("truncated")
    return text


def outline(canvas):
    """One line per block: ``type: title``. A compact summary for tool results."""
    return [f"{b.get('type', '?')}: {b.get('title', '')}" for b in canvas.get("blocks", []) if isinstance(b, dict)]
