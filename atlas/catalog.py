"""Discover the same examples the native canvas can render, without sending every schema on each turn."""
from functools import lru_cache
from pathlib import Path
from typing import get_args
import json
import re
import unicodedata

from .models import Component


@lru_cache(maxsize=1)
def entries():
    return json.loads(Path(__file__).with_name("catalog.json").read_text(encoding="utf-8"))


def normalized(value):
    return ''.join(ch for ch in unicodedata.normalize('NFKD', value.casefold()) if not unicodedata.combining(ch))


def search(q='', category=''):
    query = normalized(q.strip())
    return [{key: item[key] for key in ('type','label','category')} for item in entries()
            if (not category or normalized(category) == normalized(item['category']))
            and query in normalized(' '.join((item['type'], item['label'], item['example']['title'])))]


@lru_cache(maxsize=1)
def model_types():
    return {model.model_fields['type'].annotation.__args__[0]: model
            for model in get_args(get_args(Component)[0])}


def detail(kind):
    if kind not in model_types():
        raise KeyError(kind)
    entry = next(item for item in entries() if item['type'] == kind)
    return {**entry, 'schema': model_types()[kind].model_json_schema()}


_STOP = {'com','dos','das','para','por','uma','campo','grafico','controle','lista','mapa','tipo'}


def suggestions(prompt):
    words = set(re.findall(r'[a-z0-9_]+', normalized(prompt)))
    ranked = []
    for entry in entries():
        kind = entry['type']
        terms = set(normalized(entry['label']).split()) - _STOP
        matches = sum(len(word) for word in terms if len(word)>2 and
                      (word in words or word+'s' in words or word.rstrip('s') in words))
        score = matches + (40 if kind in words else 0)
        if score:
            ranked.append((score, entry))
    return [item for _,item in sorted(ranked, key=lambda pair:-pair[0])[:3]]
