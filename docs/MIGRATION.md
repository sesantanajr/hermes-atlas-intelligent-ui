# Migrar para a 1.1

**Seus canvases continuam.** O formato de canvas (`schema_version` 1.0) e os 73 tipos de bloco são
os mesmos desde a 0.6. O que mudou na 1.1 é o nome do plugin no Hermes: `hermes-atlas` passou a ser
**`atlas-intelligent-ui`**.

## Da 1.0 para a 1.1

O Hermes guarda tudo de um plugin pelo nome dele: a pasta em `plugins/`, as opções em
`plugins.entries.<nome>`, a pasta de dados em `plugin-data/<nome>`, as rotas do dashboard e a
extensão do Desktop. Por isso ele **recusa atualizar** uma instalação cujo nome mudou:
`hermes plugins update hermes-atlas` responde que o plugin mudou de nome e mantém a 1.0
funcionando. Para passar à 1.1, reinstale uma vez.

O que vem junto sozinho:

- **A biblioteca.** `hermes plugins remove` não apaga `plugin-data/`. Na primeira vez que a 1.1 abre
  a biblioteca num perfil, ela copia `plugin-data/hermes-atlas/atlas.db` para
  `plugin-data/atlas-intelligent-ui/` (cópia nativa do SQLite, com trava entre processos). A pasta
  antiga não é apagada (apague-a quando quiser). Se a biblioteca ainda estiver no formato da
  0.6, ela recebe antes, no lugar, a mesma atualização de formato que a 1.0 faria na primeira
  abertura: é isso que mantém seus canvases e conversas com o mesmo dono.
- **As opções**, enquanto a entrada `hermes-atlas` existir em `config.yaml`: valem na 1.1 e são
  gravadas na entrada nova. `hermes plugins remove hermes-atlas` apaga essa entrada, então a ordem
  importa se você mudou alguma opção (veja abaixo).

### Caminho rápido (não mudou opções do plugin)

```sh
hermes plugins remove hermes-atlas
hermes plugins install sesantanajr/hermes-atlas-intelligent-ui
hermes plugins enable atlas-intelligent-ui
hermes atlas migrate
```

`hermes atlas migrate` copia a biblioteca na hora e diz se sobrou algo da 1.0.

### Mantendo as opções

```sh
hermes plugins install sesantanajr/hermes-atlas-intelligent-ui   # sem --enable: fica desligado ao lado da 1.0
hermes plugins disable hermes-atlas
hermes plugins enable atlas-intelligent-ui
hermes atlas migrate                                               # copia a biblioteca e as opções
hermes plugins remove hermes-atlas
hermes atlas doctor
```

Nunca deixe as duas versões ligadas ao mesmo tempo: as duas registram as mesmas ferramentas
`atlas_*`, e a 1.0 venceria.

**Listas de toolsets por plataforma.** Se o seu `config.yaml` tem listas salvas em
`platform_toolsets`, o Hermes tira o toolset `atlas` delas em `disable` e `remove`, e só o devolve
num `enable` que muda alguma coisa. Depois da ordem acima, rode
`hermes plugins disable atlas-intelligent-ui` e `hermes plugins enable atlas-intelligent-ui`, ou
acrescente `atlas` de volta às listas. `hermes tools` mostra o que está ativo.

### Depois de reinstalar

- **Hermes Desktop e Webapp:** use **Capacidades → Plugins → Reescanear** (ou reinicie o Desktop) e
  ligue a chave **Desktop** do Atlas Intelligent UI: ela vem desligada para um plugin novo. A
  extensão antiga sai sozinha quando o Desktop percebe que `plugins/hermes-atlas` não existe mais.
- **Dashboard web:** recarregue a página; se a aba não aparecer, reinicie `hermes dashboard`.
- **Vários perfis:** repita em cada perfil que tinha a 1.0.
- **Serviço com o app independente:** se um serviço rodava o Atlas a partir de
  `plugins/hermes-atlas`, aponte-o para `plugins/atlas-intelligent-ui` e use
  `python -m hermes_atlas serve --port <porta>`. A 1.1 lê sozinha a chave do servidor de API no
  `.env` do perfil; veja [Desenvolvimento](DEVELOPMENT.md#app-independente-como-serviço). No wheel
  independente, o comando agora é `atlas-intelligent-ui` (`hermes-atlas` continua como apelido).
- **Conferir:** `hermes plugins doctor atlas-intelligent-ui` e `hermes atlas doctor`. O segundo
  aponta qualquer coisa que a 1.0 tenha deixado: a pasta `plugins/hermes-atlas`, `hermes-atlas` em
  `plugins.enabled`, a extensão antiga do Desktop ou uma cópia da biblioteca que falhou.

### O que muda para quem automatiza o Atlas

| Até a 1.0 | Na 1.1 |
| --- | --- |
| `hermes plugins … hermes-atlas` | `hermes plugins … atlas-intelligent-ui` |
| `plugins.entries.hermes-atlas.settings` | `plugins.entries.atlas-intelligent-ui.settings` |
| `plugin-data/hermes-atlas/` | `plugin-data/atlas-intelligent-ui/` |
| `/api/plugins/hermes-atlas/…` | `/api/plugins/atlas-intelligent-ui/…` (mesmas rotas) |
| Eventos `plugin.hermes-atlas.*` | `plugin.atlas-intelligent-ui.*` |
| Skill `hermes-atlas:canvas` | `atlas-intelligent-ui:canvas` |
| Módulo `hermes_plugins.hermes_atlas` | `hermes_plugins.atlas_intelligent_ui` |

Não mudaram: as ferramentas `atlas_*`, o toolset `atlas`, o comando `/atlas`, `hermes atlas`, o
pacote Python interno `hermes_atlas` e o formato dos canvases.

## Da 0.6 para a 1.1

Siga os passos da 1.0 para a 1.1: a 0.6 também se chamava `hermes-atlas`. Na primeira abertura, a
1.1 acrescenta ao banco da 0.6 o que precisa, sem apagar nada, e o copia para a pasta nova. Se o
Hermes recusar remover ou reinstalar por causa das dependências que a 0.6 declarava, rode o
`remove` primeiro; a biblioteca não é apagada.

Quem usava o **wheel** (`pip install hermes-atlas-intelligent-ui` e `hermes-atlas serve`): o wheel
continua disponível para o app independente, gerado por `scripts/build_wheel.py`, mas não instala
mais o plugin. O comando `hermes-atlas install-plugin` foi removido; instale o plugin com
`hermes plugins install`.

### O que muda para você

| Na 0.6 | Na 1.x |
| --- | --- |
| O canvas aparecia na página Atlas e no chat do Atlas. | Também aparece vivo dentro das respostas do Hermes Desktop e do Webapp, sem sair da conversa. |
| O agente criava canvases novos para cada mudança. | O agente muda só o que precisa (`atlas_update`) e lê o que você marcou (`atlas_get`). |
| No terminal e nos apps de mensagem, o modelo não sabia o que fazer com um canvas. | Ele responde em texto e anexa a página HTML quando você pede. |
| Interface só em português, com cores próprias. | Português e inglês; cores do tema do Hermes. |
| Plugin declarava dependências Python. | Nenhuma dependência: instalação e atualização sem consentimento de dependências. |

### Para quem automatiza o Atlas

- **Ferramentas.** `atlas_components`, `atlas_render`, `atlas_get`, `atlas_list` e
  `atlas_resources` continuam com os mesmos nomes. Toda resposta é um objeto JSON com
  `success`; quando falha, `error` explica ao modelo como corrigir. Veja [Ferramentas](TOOLS.md).
- **`atlas_render` sempre cria um canvas novo.** Para alterar um existente, use `atlas_update`.
  Prompts salvos da 0.x que passavam `expected_revision` e `id` ao `atlas_render` continuam
  funcionando por compatibilidade.
- **API HTTP** (`/api/plugins/atlas-intelligent-ui/…` na 1.1): as rotas da 0.6 continuam. Novas
  rotas: `POST /clients/{kind}`, `DELETE /canvases/{id}`, `GET|PUT|DELETE /canvases/{id}/draft`,
  `GET /canvases/{id}/text` e `GET /canvases/{id}/export?format=html|markdown|json`.
- **Módulo Python** `atlas` passou a se chamar `hermes_atlas`, organizado em subpacotes (veja a
  [Arquitetura](ARCHITECTURE.md)).
