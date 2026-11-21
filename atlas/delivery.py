"""Presentation of Hermes control replies in chat, history and run snapshots."""
import re


# Explicit whole-line forms from Hermes gateway.response_filters. Quoted tokens,
# Markdown syntax and literal examples remain ordinary content in the Atlas UI.
_MARKERS = frozenset(('[SILENT]', 'SILENT', 'NO_REPLY', 'NO REPLY', '[静默]', '静默', '[沉默]', '沉默'))
_FENCE = re.compile(r'^ {0,3}(`{3,}|~{3,})([^\n]*)', re.MULTILINE)
FAILURE_NOTICE = {'failed': 'O Hermes não concluiu a execução.',
                  'cancelled': 'Execução interrompida.', 'interrupted': 'O gateway foi interrompido.'}


def _in_fence(text, stop):
    opened = ''
    for fence in _FENCE.finditer(text, 0, stop):
        mark, rest = fence.groups()
        if opened:
            if mark.startswith(opened) and not rest.strip():
                opened = ''
        elif mark[0] != '`' or '`' not in rest:
            opened = mark
    return bool(opened)


def display_text(text, *, streaming=False):
    """Hold a possible last-line marker until it diverges, preserving the raw SSE buffer."""
    if not isinstance(text, str) or not text:
        return text
    end = len(text.rstrip())
    start = text.rfind('\n', 0, end) + 1
    if not 0 < end - start <= 64:
        return text
    line = text[start:end]
    if line.startswith(('    ', '\t')) or '\t' in line[:len(line) - len(line.lstrip())]:
        return text
    token = ' '.join(line.upper().split())
    matches = token in _MARKERS or (streaming and any(mark.startswith(token) for mark in _MARKERS))
    if not matches or _in_fence(text, start):
        return text
    return text[:start].rstrip()


def present_reply(record, field):
    raw = record.get(field)
    clean = display_text(raw)
    if raw == clean:
        return record
    result = {**record, field: clean}
    if clean or result.get('warning') or result.get('artifact'):
        return result
    status = result.get('status') or 'completed'
    if status == 'completed':
        result['delivery'] = 'silent'
    elif status in FAILURE_NOTICE:
        result['warning'] = FAILURE_NOTICE[status]
    return result


def present_conversation(record):
    if not record:
        return record
    record['messages'] = [present_reply(m, 'content') if m.get('role') == 'assistant' else m
                          for m in record.get('messages', [])]
    return record


def present_event(event):
    if (event.get('type') or event.get('event')) != 'message.interim' or not event.get('text'):
        return event
    clean = display_text(event['text'])
    if not clean:
        return None
    return event if clean == event['text'] else {**event, 'text': clean}
