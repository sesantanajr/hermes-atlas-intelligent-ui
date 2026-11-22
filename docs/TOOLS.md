# Ferramentas do agente

Sete ferramentas no toolset `atlas`. Todas respondem com um objeto JSON que tem `success`; quando
algo dá errado, `success` é `false` e `error` diz ao modelo o que corrigir. As descrições que o
modelo vê estão em inglês ([`hermes_atlas/agent/tool_schemas.py`](../hermes_atlas/agent/tool_schemas.py));
juntas, as sete definições somam cerca de 1.800 tokens.

Os exemplos abaixo são resultados reais, com os caminhos encurtados.

## `atlas_components`

Consulta o catálogo de blocos.

| Parâmetro | Tipo | |
| --- | --- | --- |
| `type` / `types` | texto / lista (até 6) | Devolve o schema JSON exato e um exemplo válido de cada tipo. |
| `q` | texto | Busca por nome ou finalidade, em português ou inglês (“linha do tempo”, “timeline”). |
| `category` | texto | `text`, `layout`, `forms`, `controls`, `data`, `media`, `info` ou `apps`. |

Sem parâmetros, lista os 73 tipos agrupados por categoria, com uma frase de finalidade cada:

```json
{ "success": true, "count": 73, "categories": [ … ],
  "next": "Call atlas_components(type=...) or types=[...] for the exact schema and a working example." }
```

## `atlas_render`

Cria um canvas, valida, salva a revisão 1 e diz ao modelo como mostrá-lo.

| Parâmetro | Tipo | |
| --- | --- | --- |
| `canvas` | objeto | `title`, `blocks` (até 32) e, opcionalmente, `description`, `sources` (`{title, url}`) e `state`. Cada bloco tem `type`, `id` e `title`. |

```json
{
  "success": true,
  "id": "canvas-81f797341c87494abb49a38b16f4cc4a",
  "revision": 1,
  "title": "Viagem a Lisboa",
  "blocks": 1,
  "status": "created",
  "surface": "desktop",
  "show": "file",
  "directive": "::atlas{id=\"canvas-81f797341c87494abb49a38b16f4cc4a\" rev=\"1\"}",
  "file": "/home/ana/.hermes/plugin-data/hermes-atlas/exports/viagem-a-lisboa-f4cc4a-v1.html",
  "media": "MEDIA:/home/ana/.hermes/plugin-data/hermes-atlas/exports/viagem-a-lisboa-f4cc4a-v1.html",
  "present": "Show it by ending your reply with this line, by itself: MEDIA:… Hermes Desktop draws the interactive canvas there, and other apps receive it as a page to open. Do not repeat the canvas content; one or two sentences of guidance at most."
}
```

`show` é `file`, `directive`, `text` ou `either`; veja
[Arquitetura → Como um canvas chega ao usuário](ARCHITECTURE.md#como-um-canvas-chega-ao-usuário).
`file` e `media` só aparecem com `show: "file"`.

Um canvas inválido não é salvo. O erro aponta o bloco e o campo:

```text
Invalid canvas. blocks[0].table: each row needs the same column count | blocks[1]: unknown block
type 'hologram' | blocks[2].metric.onclick: this field does not exist
```

## `atlas_update`

Muda partes de um canvas e salva uma nova revisão.

| Parâmetro | Tipo | |
| --- | --- | --- |
| `id` | texto | O canvas. |
| `expected_revision` | inteiro | A revisão que o modelo leu. Se o usuário ou outro turno mudou o canvas depois, a mudança é recusada. |
| `operations` | lista (até 40) | Aplicadas em ordem, todas ou nenhuma. |

| Operação | Campos |
| --- | --- |
| `add_block` | `block` (completo, com `id` novo); opcional `before` (id do bloco seguinte; sem ele, vai para o fim) |
| `replace_block` | `block`, com o `id` do bloco substituído (se o tipo mudar, o estado daquele bloco é descartado) |
| `remove_block` | `id` |
| `move_block` | `id` e, opcionalmente, `before` (sem ele, vai para o fim) |
| `set` | `field` (`title` ou `description`) e `text` |
| `set_sources` | `sources` |
| `set_state` | `id` do bloco e `state` (objeto; vazio limpa o estado) |

O resultado tem os mesmos campos de `atlas_render`, com `status: "updated"`. Revisão desatualizada:

```json
{ "success": false,
  "error": "The canvas is now at revision 2, not 1: the user or another turn changed it. Read it again with atlas_get, then retry." }
```

## `atlas_get`

Lê um canvas com o estado atual do usuário.

| Parâmetro | Tipo | |
| --- | --- | --- |
| `id` | texto | |
| `revision` | inteiro | Opcional; padrão: a mais recente. |
| `view` | texto | `full` (JSON, padrão), `outline` (ids, tipos e títulos) ou `text` (Markdown). |
| `blocks` | lista | Só estes blocos. |

Se o usuário mexeu no canvas e ainda não salvou uma versão, a resposta traz o estado do rascunho
e `unsaved_user_changes`. Um canvas grande demais para a resposta volta como esboço, com
`too_large: true`; peça blocos específicos.

```json
{ "success": true, "id": "canvas-81f7…", "revision": 2, "title": "Viagem a Lisboa",
  "blocks": [ { "id": "todo", "type": "checklist", "title": "Antes de sair" },
              { "id": "cost", "type": "metric", "title": "Custo" } ] }
```

## `atlas_list`

Busca na biblioteca, do mais recente ao mais antigo.

| Parâmetro | Tipo | |
| --- | --- | --- |
| `q` | texto | Parte do título. |
| `limit`, `offset` | inteiros | Paginação; `more` indica se há mais. |

```json
{ "success": true, "offset": 0, "more": false,
  "canvases": [ { "id": "canvas-81f7…", "revision": 2, "title": "Viagem a Lisboa", "updated": "2026-11-22T01:55:42+00:00" } ] }
```

## `atlas_export`

Grava um canvas em `<HERMES_HOME>/plugin-data/hermes-atlas/exports/`.

| Parâmetro | Tipo | |
| --- | --- | --- |
| `id` | texto | |
| `revision` | inteiro | Opcional. |
| `format` | texto | `html` (página interativa autossuficiente, padrão), `markdown` ou `json`. |

```json
{ "success": true, "id": "canvas-81f7…", "revision": 2, "format": "markdown",
  "path": "/home/ana/.hermes/plugin-data/hermes-atlas/exports/viagem-a-lisboa-f4cc4a-v2.md",
  "bytes": 94, "media": "MEDIA:/home/ana/.hermes/plugin-data/hermes-atlas/exports/viagem-a-lisboa-f4cc4a-v2.md",
  "present": "To deliver the file, write the `media` line by itself in your reply: …" }
```

## `atlas_resources`

Mede a máquina onde o Hermes roda: disco da raiz (usado e livre), memória disponível, swap,
carga média de 1, 5 e 15 minutos e número de CPUs. Só lê contadores do sistema operacional; não
percorre diretórios. Pode ser desligada com a opção `resources_tool`.
