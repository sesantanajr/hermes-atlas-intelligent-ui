"""How a reply in the Atlas chat carries a canvas.

Two forms are understood, and the model may use either:

* **directive** (preferred): the model calls the ``atlas_render`` tool, which saves the canvas, and
  writes ``::atlas{id="..." rev="..."}`` in its reply. The same line is what Hermes Desktop turns
  into an inline canvas, so one habit serves every surface.
* **fenced JSON**: one fenced ``atlas`` block holding the canvas itself. It needs no tool, so it
  still works when the ``atlas`` toolset is switched off, and it streams (blocks appear as they
  arrive). A JSON decoder, not a fence regex, owns the JSON boundary.
"""
import json
import re

from .. import directive
from ..catalog import suggestions
from ..chat.delivery import display_text
from ..schema.canvas import Canvas

INSTRUCTIONS = '''You are answering in Hermes Atlas, a chat that draws interactive canvases. Reply in the user's language. Cite facts, label sample data. When UI helps, either call atlas_render and write its `directive` line by itself in your reply, or, without that tool, emit one fenced `atlas` JSON {title,blocks:[...],sources?:[{title,url}]}. Each block has type,id,title. Never emit HTML or claim an unperformed action. Keep the active canvas state when relevant. Common blocks:
text{text}; metric{value:string,detail?}; chart{points:[{label,value}],unit?}; series{kind:line|bar|area,x_axis:category|date,labels:[string],datasets:[{id,label,values:[number|null]}],unit?}; table{columns:[string],rows:[[string]]}; checklist{items:[string]}; comparison{options:[{name,description,features:[string]}]}; collection{items:[{id,title,description?,score?:0..100,source?:{title,url}}]}.
calculator{operation:sum|product|split|compound,inputs:[{label,value,min,max,step}],unit?}; form{fields:[{id,label,kind:text|number|date|textarea|checkbox|select|radio,options?:[string],required?:bool}]}; tabs or timeline{items:[{id,title,body,points?:[string]}]}; route{items:[{id,title,body,lat,lon}]}; flashcards{items:[{id,question,answer}]}. atlas_components lists 73 block types with schemas.'''


def instructions_for(prompt):
    examples = []
    for item in suggestions(prompt):
        sample = json.dumps(item['example'], ensure_ascii=False, separators=(',', ':'))
        if sum(map(len, examples)) + len(sample) <= 3600:
            examples.append(sample)
    if not examples:
        return INSTRUCTIONS
    return INSTRUCTIONS + '\nRelevant supported examples. Adapt their data and IDs:\n' + '\n'.join(examples)


def extract(content):
    """``(text, canvas, warning)`` from a finished reply that may hold a fenced ``atlas`` block."""
    if not isinstance(content, str) or not content.strip():
        raise ValueError("O Hermes terminou sem texto nem canvas.")
    content = display_text(content)
    match = re.search(r"(?m)^```atlas[ \t]*\r?\n", content)
    if not match:
        return content.strip('\r\n').rstrip(), None, None
    try:
        start = match.end()
        while start < len(content) and content[start].isspace():
            start += 1
        value, size = json.JSONDecoder().raw_decode(content[start:])
        tail = content[start + size:]
        closing = re.match(r"[ \t]*\r?\n```[ \t]*(?:\r?\n|$)", tail)
        if not closing:
            raise ValueError("Unclosed canvas fence")
        canvas = Canvas.model_validate(value)
        text = display_text(content[:match.start()] + tail[closing.end():]).strip('\r\n').rstrip()
        return text, canvas, None
    except (ValueError, TypeError):
        return content.strip('\r\n').rstrip(), None, "O canvas recebido é inválido. O conteúdo original foi preservado."


def resolve_directive(text, lookup):
    """``(text, record)``: the saved canvas a reply points at with ``::atlas{...}``, if any.

    *lookup(id, revision)* returns a stored record or ``None``. The last directive that resolves
    wins (a reply that revised its canvas names the final one last) and every resolved directive
    is removed from the text; one that names an unknown canvas is left for the reader to see.
    """
    found, record = [], None
    for reference in directive.find(text):
        saved = lookup(reference["id"], reference["revision"])
        if saved:
            found.append(reference)
            record = saved
    return (directive.strip(text, found), record) if found else (text, None)


def hide_directives(text):
    """Live text without directives: while a reply streams the canvas is shown by its own card."""
    return directive.strip(text, directive.find(text)) if "::atlas{" in text else text
