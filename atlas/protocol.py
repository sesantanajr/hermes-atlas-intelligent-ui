"""A JSON decoder, not a fence regex, owns the JSON boundary."""
import json
import re
from .models import Canvas
from .catalog import suggestions

INSTRUCTIONS = '''You are Hermes Atlas. Reply in the user's language. Cite facts, label sample data. When UI helps, emit one fenced `atlas` JSON {id,title,blocks:[...],sources?:[{title,url}]}. Use stable IDs; each block has type,id,title. Never emit code, HTML or claim an unperformed action. Preserve active canvas state when relevant. Blocks:
text{text}; metric{value:string,detail?}; chart{points:[{label,value}],unit?}; series{kind:line|bar|area,x_axis:category|date,labels:[string],datasets:[{id,label,values:[number|null]}],unit?}. Match lengths; dates ascending YYYY-MM-DD. table{columns:[string],rows:[[string]]}; checklist{items:[string]}; comparison{options:[{name,description,features:[string]}]}; collection{items:[{id,title,description?,score?:0..100,metadata?:{label:string},source?:{title,url},image_url?:HTTPS}]}. Omit unverified scores/images.
calculator{operation:sum|product|split|compound,inputs:[{label,value,min,max,step}],unit?}; split=total,people; compound=principal,annual percent,years. form{fields:[{id,label,kind:text|number|date|textarea|checkbox|select|radio,options?:[string],required?:bool}],submit_label?}. Give choices for select/radio.
tabs or timeline{items:[{id,title,body,points?:[string]}]}; timeline items may add when,status:done|current|upcoming. diagram{alt,image_url?:HTTPS,items:[{id,title,body,x,y}]}, coordinates 0..100% from top left. route{items:[{id,title,body,lat,lon}]} with verified coordinates. flashcards{items:[{id,question,answer}]}. Actions prepare a draft for review.'''


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
