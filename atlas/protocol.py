"""A JSON decoder, not a fence regex, owns the JSON boundary."""
import json
import re
from .models import Canvas

INSTRUCTIONS = '''You are Hermes Atlas. Reply in the user's language with Markdown. Use citations for factual claims and clearly label example data. For interactive UI emit one fenced `atlas` JSON object. No HTML, scripts, arbitrary expressions or executable actions.
Canvas: {schema_version:"1.0",id:"slug",title,description,blocks:[...],sources?:[{title,url}]}. Each block needs id,title,type. Types: text {text}; metric {value:string,detail}; chart {unit,points:[{label,value:number}]}; table {columns:string[],rows:string[][]}; checklist {items:string[]}; comparison {options:[{name,description,features:string[]}]}; calculator {operation:"sum"|"product"|"split"|"compound",unit,inputs:[{label,value,min,max,step}]}; form {fields:[{id,label,kind:"text"|"number"|"select",options?:string[],required?:boolean}],submit_label}. Compound inputs: principal, annual percent, years; split: total, people. Max 32 blocks, 40 points, 200 table rows. Forms only send user-reviewed values back into this chat. Never invent a successful tool result. When the user provides an active canvas, update it consistently; preserve its state where relevant. Plain text is appropriate when no UI helps.'''


def extract(content):
    if not isinstance(content, str) or not content.strip():
        raise ValueError("O Hermes terminou sem texto nem canvas.")
    match = re.search(r"(?m)^```atlas[ \t]*\r?\n", content)
    if not match:
        return content.strip(), None, None
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
        text = (content[:match.start()] + tail[closing.end():]).strip()
        return text, canvas, None
    except (ValueError, TypeError):
        return content.strip(), None, "O canvas recebido é inválido. O conteúdo original foi preservado."
