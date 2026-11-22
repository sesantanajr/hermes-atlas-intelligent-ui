"""The block catalogue: every type the renderer supports, with a working example of each.

``catalog.json`` is generated from the front end's own samples (``npm run build``), so the agent
discovers exactly what the canvas can draw. Listing and searching read only that file; the
pydantic models are imported the first time a caller asks for a JSON schema.
"""
from functools import lru_cache
from pathlib import Path
from typing import get_args
import json
import re
import unicodedata


@lru_cache(maxsize=1)
def entries():
    return json.loads(Path(__file__).with_name("catalog.json").read_text(encoding="utf-8"))


def normalized(value):
    return ''.join(ch for ch in unicodedata.normalize('NFKD', value.casefold()) if not unicodedata.combining(ch))


def _haystack(item):
    return normalized(' '.join(filter(None, (
        item['type'], item['label'], item.get('label_en', ''), item.get('summary', ''), item['example']['title']))))


def _category_matches(item, category):
    wanted = normalized(category)
    return wanted in (normalized(item['category']), normalized(item.get('category_en', '')), item.get('category_id', ''))


def summary(item):
    return {key: item[key] for key in ('type', 'label', 'label_en', 'category', 'category_en', 'summary') if key in item}


def search(q='', category=''):
    query = normalized(q.strip())
    return [summary(item) for item in entries()
            if (not category or _category_matches(item, category)) and query in _haystack(item)]


def categories():
    seen = {}
    for item in entries():
        key = item.get('category_id') or item['category']
        seen.setdefault(key, {'id': key, 'label': item['category'], 'label_en': item.get('category_en', ''), 'types': []})
        seen[key]['types'].append(item['type'])
    return list(seen.values())


def types():
    return [item['type'] for item in entries()]


@lru_cache(maxsize=1)
def model_types():
    from .schema.canvas import Component
    return {model.model_fields['type'].annotation.__args__[0]: model
            for model in get_args(get_args(Component)[0])}


def entry(kind):
    for item in entries():
        if item['type'] == kind:
            return item
    raise KeyError(kind)


def detail(kind):
    if kind not in model_types():
        raise KeyError(kind)
    return {**entry(kind), 'schema': model_types()[kind].model_json_schema()}


_STOP = {'com', 'dos', 'das', 'para', 'por', 'uma', 'campo', 'grafico', 'controle', 'lista', 'mapa', 'tipo',
         'the', 'and', 'for', 'with', 'list', 'chart', 'field', 'type'}


def suggestions(prompt):
    words = set(re.findall(r'[a-z0-9_]+', normalized(prompt)))
    ranked = []
    for item in entries():
        kind = item['type']
        terms = (set(normalized(item['label']).split()) | set(normalized(item.get('label_en', '')).split())) - _STOP
        matches = sum(len(word) for word in terms if len(word) > 2 and
                      (word in words or word + 's' in words or word.rstrip('s') in words))
        score = matches + (40 if kind in words else 0)
        if score:
            ranked.append((score, item))
    return [item for _, item in sorted(ranked, key=lambda pair: -pair[0])[:3]]
