---
name: canvas
description: "Answer with an interactive Atlas canvas (charts, tables, forms, checklists, maps, boards, calculators) when a reply is easier to explore than to read. Covers when to use one, how to build, show and update it."
version: 1.1.0
author: sesantanajr
license: MIT
metadata:
  hermes:
    tags: [UI, Canvas, Charts, Forms, Visualization]
---

# Atlas canvases

An Atlas canvas is a small interactive page made of validated blocks. You describe it as JSON
with the `atlas_render` tool; Hermes Atlas draws it for the user and keeps it in their library.
The user can tick, sort, filter, fill in and adjust it, and you can read what they did.

## When a canvas helps

Use one when the user will *do* something with the answer, or when the shape of the data matters:

- comparing options, products, plans or prices
- numbers over time or by category, dashboards, rankings
- plans, itineraries, checklists, kanban boards, step-by-step guides
- study material: flashcards, quizzes, timelines, glossaries
- anything to fill in or adjust: forms, budgets, calculators, polls
- places and routes on a map

Do not use one for a short factual answer, a single paragraph, or code the user will copy.
A canvas complements your reply; it does not replace a direct answer to a direct question.

## Workflow

1. **Choose blocks.** `atlas_components()` lists the 73 block types by category with a one-line
   purpose each. Skip this when you already know the types you need.
2. **Read their schemas.** `atlas_components(types=["series", "table"])` returns the exact JSON
   schema and a working example for up to six types. Do this once per type in a conversation;
   field names differ between blocks and unknown fields are rejected.
3. **Build it.** `atlas_render(canvas={title, description, blocks, sources})`. Every block needs
   `type`, `id` and `title`. Use short stable ids such as `budget` or `day-2`.
4. **Show it.** The result has `show` and `present`. Follow `present`:
   - `show: "file"`: end your reply with the `media` line by itself, for example
     `MEDIA:/home/me/.hermes/plugin-data/atlas-intelligent-ui/exports/trip-1f0c3a-v1.html`. Hermes
     Desktop draws the live canvas there; other apps receive the page as a file. Copy the line
     exactly. Add a sentence or two of guidance and stop; do not restate the canvas in prose.
   - `show: "directive"`: write the `directive` line by itself in your reply, for example
     `::atlas{id="canvas-1f0c" rev="1"}`. The user's app replaces it with the live canvas.
   - `show: "text"`: this chat cannot draw canvases. Give the essential content in plain text
     and mention it is saved in the Atlas library. `atlas_export` writes a file you can attach.
   - `show: "either"`: the surface is unknown; `present` says what to write in each case.
5. **If validation fails**, the error names the block and field. Fix that and call again;
   do not fall back to a plain-text table unless the user asks.

## Updating a canvas

Never rebuild a canvas to change part of it.

1. `atlas_get(id)` returns the latest revision and the user's current state.
2. `atlas_update(id, expected_revision, operations)` with one or more of:
   `add_block`, `replace_block`, `remove_block`, `move_block`, `set` (title or description),
   `set_sources`, `set_state`.

A stale `expected_revision` is refused. That means the user changed the canvas: read it again.

## What the user did

- `atlas_get` returns `state` per block: ticked items, form answers, chosen options, edited
  text, moved cards. `unsaved_user_changes` means they are still working on it.
- A line starting with `[Atlas]` in a user message tells you they changed a canvas you made.
  Read it with `atlas_get` before you talk about it.
- When the user submits a form or picks cards, their choice arrives as a normal message.

## Rules that keep a canvas valid

- Blocks are declarative JSON. There is no HTML, script, formula language or custom styling.
- Numbers are JSON numbers, not strings. Dates are `YYYY-MM-DD`. Images, audio and video need
  HTTPS URLs; never invent a URL.
- Label made-up data as an example in the title or description. Put real sources in `sources`
  as `{title, url}`.
- Up to 32 blocks and 256 KB per canvas. Prefer four to eight focused blocks.
- Ids use letters, digits, `_` and `-`, and are unique within the canvas.
- Write titles and text in the user's language.

## Frequently used blocks

| Need | Block types |
|---|---|
| Headline numbers | `metric`, `dashboard`, `progress`, `gauge` |
| Trends and comparisons | `series`, `chart`, `ranking`, `waterfall`, `radar` |
| Parts of a whole | `donut`, `pie`, `treemap`, `funnel` |
| Tabular detail | `table`, `collection`, `comparison`, `facts` |
| Plans and tracking | `checklist`, `checklist_group`, `steps_list`, `timeline`, `kanban` |
| Input from the user | `form`, `single_choice`, `multi_choice`, `slider`, `date_range`, `budget_planner`, `calculator` |
| Learning | `flashcards`, `quiz`, `glossary`, `tabs`, `accordion` |
| Places | `map`, `route`, `places` |
| Narrative | `heading`, `markdown`, `callout`, `article`, `quote` |

## Example

```json
{
  "canvas": {
    "title": "Weekend in Lisbon (example budget)",
    "description": "Adjust the quantities; the balance updates as you go.",
    "blocks": [
      {"type": "metric", "id": "total", "title": "Planned spend", "value": "€ 410", "detail": "2 people, 2 nights"},
      {"type": "budget_planner", "id": "budget", "title": "Budget", "currency": "EUR", "limit_cents": 50000,
       "items": [
         {"id": "hotel", "label": "Hotel night", "price_cents": 12000, "quantity": 2},
         {"id": "food", "label": "Dinner for two", "price_cents": 6000, "quantity": 2},
         {"id": "tram", "label": "Day pass", "price_cents": 700, "quantity": 4}
       ]},
      {"type": "checklist", "id": "todo", "title": "Before you go", "items": ["Book the hotel", "Buy tram passes"]}
    ]
  }
}
```
