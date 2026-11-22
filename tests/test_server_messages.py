"""The interface can show every message the Atlas server writes in English as well.

The server speaks Portuguese; ``src/i18n/en.server.ts`` holds the English the interface shows
through ``serverText()``. This test reads both sides, so a new server message cannot ship
without a translation and a removed one cannot leave a stale entry behind.
"""
import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TABLE = ROOT / "src" / "i18n" / "en.server.ts"
PACKAGES = ("server", "storage", "chat")


def _docstrings(tree):
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            first = node.body[0] if node.body else None
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant):
                found.add(id(first.value))
    return found


def _is_sentence(text):
    """A message meant for a person: starts with a capital, has several words, ends a sentence."""
    return bool(re.match(r"[A-ZÀ-Ý]", text)) and " " in text and text.endswith(".") and "\n" not in text


def server_messages():
    """``(fixed, templated)``: the sentences in the server's code, and its f-string sentences
    with every interpolated value replaced by ``404``."""
    fixed, templated = {}, {}
    for package in PACKAGES:
        for path in sorted((ROOT / "hermes_atlas" / package).glob("*.py")):
            tree = ast.parse(path.read_text(encoding="utf-8"))
            skip = _docstrings(tree)
            inside_fstring = set()
            for node in ast.walk(tree):
                if isinstance(node, ast.JoinedStr):
                    inside_fstring.update(id(part) for part in node.values)
                    sample = "".join(
                        part.value if isinstance(part, ast.Constant) else "404" for part in node.values)
                    if _is_sentence(sample):
                        templated.setdefault(sample, f"{path.name}:{node.lineno}")
            for node in ast.walk(tree):
                if (isinstance(node, ast.Constant) and isinstance(node.value, str)
                        and id(node) not in skip and id(node) not in inside_fstring
                        and _is_sentence(node.value)):
                    fixed.setdefault(node.value, f"{path.name}:{node.lineno}")
    return fixed, templated


def translation_table():
    """``(keys, patterns)`` parsed from the TypeScript table."""
    source = TABLE.read_text(encoding="utf-8")
    table, _, tail = source.partition("export const enServerPatterns")
    keys = [bytes(key, "utf-8").decode("unicode_escape").encode("latin-1").decode("utf-8")
            if "\\" in key else key
            for key in re.findall(r'^\s*"((?:[^"\\\n]|\\.)*)":', table, flags=re.M)]
    patterns = [re.compile(pattern) for pattern in re.findall(r"\[/(.+?)/,", tail)]
    return keys, patterns


def test_the_collector_finds_the_servers_messages():
    fixed, templated = server_messages()
    assert "Canvas não encontrado." in fixed
    assert "O Hermes não concluiu a execução." in fixed  # chat/delivery.py
    assert any(sample.startswith("Hermes recusou a operação") for sample in templated)
    assert len(fixed) > 30


def test_every_server_message_has_an_english_translation():
    fixed, templated = server_messages()
    keys, patterns = translation_table()
    missing = {text: where for text, where in fixed.items() if text not in keys}
    assert not missing, f"add these to src/i18n/en.server.ts: {missing}"
    unmatched = {text: where for text, where in templated.items()
                 if not any(pattern.search(text) for pattern in patterns)}
    assert not unmatched, f"add a pattern for these to enServerPatterns: {unmatched}"


def test_the_table_has_no_entry_for_a_message_that_is_gone():
    fixed, templated = server_messages()
    keys, patterns = translation_table()
    assert len(keys) == len(set(keys)), "duplicate keys in en.server.ts"
    stale = [key for key in keys if key not in fixed]
    assert not stale, f"remove these from src/i18n/en.server.ts: {stale}"
    unused = [pattern.pattern for pattern in patterns
              if not any(pattern.search(text) for text in templated)]
    assert not unused, f"remove these patterns from enServerPatterns: {unused}"
