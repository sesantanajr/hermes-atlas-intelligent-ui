"""Project observed Hermes tool lifecycles into bounded, displayable steps."""
import json
import math
import re

_BOUNDARIES = {'tool.started','tool.completed','tool.failed','subagent.start','subagent.complete'}
_IDENTIFIER = re.compile(r'[\w.:-]{1,128}\Z', re.ASCII)
_REASONS = {'timeout','denied','cancelled','nonzero_exit'}


def _identifier(value):
    return value if isinstance(value, str) and _IDENTIFIER.fullmatch(value) else None


def _duration(value):
    if type(value) in (float,int) and 0 <= value <= 365 * 86400 and math.isfinite(value):
        return value
    return None


def _reason(event):
    if event.get('reason') in ('timeout','denied','cancelled','nonzero_exit'):
        return event['reason']
    # Only inspect the result envelope from a finished call. A timeout option in
    # tool arguments or natural-language stdout is not evidence of a timeout.
    result = event
    preview = event.get('preview')
    if isinstance(preview, str) and len(preview) <= 4096 and preview.lstrip().startswith('{'):
        try:
            decoded = json.loads(preview)
            if isinstance(decoded, dict):
                result = decoded
        except (ValueError, RecursionError):
            pass
    exit_code = result.get('exit_code')
    if result.get('timed_out') is True or (type(exit_code) is int and exit_code == 124):
        return 'timeout'
    if result.get('denied') is True or result.get('status') == 'denied':
        return 'denied'
    if result.get('status') in ('cancelled','canceled'):
        return 'cancelled'
    if type(exit_code) is int and exit_code != 0:
        return 'nonzero_exit'
    return None


def step_event(event):
    """Return only lifecycle metadata. Never retain command arguments or tool output here."""
    kind = event.get('type') or event.get('event')
    if not isinstance(kind, str) or kind not in _BOUNDARIES:
        return None
    clean = {'type':kind}
    if type(event.get('seq')) is int:
        clean['seq'] = event['seq']
    for field in ('tool','tool_call_id','subagent_id','child_session_id','delegation_id'):
        value = _identifier(event.get(field))
        if value:
            clean[field] = value
    if type(event.get('task_index')) is int:
        clean['task_index'] = event['task_index']
    if type(event.get('error')) is bool:
        clean['error'] = event['error']
    status = event.get('status')
    if status in ('completed','success','succeeded','ok','failed','error','timeout','timed_out','cancelled','canceled','denied'):
        clean['status'] = status
    duration = _duration(event.get('duration',event.get('duration_seconds')))
    if duration is not None:
        clean['duration'] = duration
    if kind in ('tool.completed','tool.failed','subagent.complete'):
        reason = _reason(event)
        if reason:
            clean['reason'] = reason
    return clean


def _key(event, group):
    if group == 'tool':
        return event.get('tool_call_id')
    # Hermes can announce the child session id only on completion. Prefer the
    # batch+index identity shared by its start and completion.
    if event.get('delegation_id') and 'task_index' in event:
        return (event['delegation_id'],event['task_index'])
    return event.get('subagent_id') or event.get('child_session_id')


def _verdict(event):
    status = event.get('status')
    if (event['type'] == 'tool.failed' or event.get('error') is True or event.get('reason')
            or status in ('failed','error','timeout','timed_out','denied','cancelled','canceled')):
        return 'failed'
    if event.get('error') is False or status in ('completed','success','succeeded','ok'):
        return 'succeeded'
    return 'unknown'


def summarize(events, *, limited=False, terminal=False):
    steps = []
    keys = []
    seen = set()
    for raw in events:
        e = step_event(raw)
        if not e:
            continue
        seq = e.get('seq')
        if seq is not None:
            if seq in seen:
                continue
            seen.add(seq)
        kind = e['type']
        group = 'tool' if kind.startswith('tool.') else 'subagent'
        name = (e.get('tool') or 'Ferramenta') if group == 'tool' else 'Especialista'
        key = _key(e,group)
        started = kind in ('tool.started','subagent.start')
        # An explicit call id is authoritative, including repeated deliveries.
        index = next((i for i,item in enumerate(steps)
                      if item['kind'] == group and keys[i] == key and
                      (key is not None or (not started and item['name'] == name and item['status']=='running'))), None)
        if index is None:
            index = len(steps)
            steps.append({'kind':group,'name':name,'status':'running'})
            keys.append(key)
        if not started:
            step = steps[index]
            step['status'] = _verdict(e)
            if 'duration' in e:
                step['duration'] = e['duration']
            reason = e.get('reason')
            if not reason:
                reason = {'timeout':'timeout','timed_out':'timeout','denied':'denied',
                          'cancelled':'cancelled','canceled':'cancelled'}.get(e.get('status'))
            if reason in _REASONS:
                step['reason'] = reason
    if not steps:
        return None
    if terminal:
        for step in steps:
            if step['status']=='running':
                step['status']='unknown'
    return {'steps':steps,'limited':bool(limited)}
