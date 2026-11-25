# Compatibilidade com o Hermes Agent

O Atlas Intelligent UI 1.1.2 (id `atlas-intelligent-ui`) declara `requires_hermes: ">=0.21.0"`.
Tudo o que surgiu depois disso é detectado em tempo de execução: num Hermes mais antigo, o recurso
correspondente simplesmente não aparece, e o resto funciona.

O contrato abaixo foi conferido no código-fonte do Hermes Agent v0.23.3 (commit `caafe538`, a
versão estável de 20/11/2026), no `main` de 20/11/2026 para o Desktop e o dashboard, e com o
`hermes plugins doctor` de uma instalação real v0.23.3 (Linux, Python 3.14). A 1.1.2 foi conferida
no código do Hermes Agent v0.23.4 (`8fc03744`, 25/11/2026): `gateway/session_policy.py`
(`source: gui` → superfície `desktop`), `hermes_cli/plugin_session.py` (`turn_client`),
`hermes_cli/plugin_rpc.py` e `gateway/session_plugin_rpc.py` (RPC de plugins),
`hermes_cli/web_server_plugin_profiles.py` (PLG-3), e com `hermes plugins validate` e
`hermes plugins doctor --ci` dessa instalação.

**Nome do plugin.** O Hermes deriva do campo `name` do `plugin.yaml` a pasta de instalação, a
chave em `plugins.enabled`, as opções em `plugins.entries.<nome>`, o nome do módulo
(`hermes_plugins.atlas_intelligent_ui`), a skill (`atlas-intelligent-ui:canvas`) e, pelo
`dashboard/manifest.json`, as rotas `/api/plugins/<nome>/`. A extensão do Desktop usa o `id` do
`plugin.js` para `ctx.rest`, para a chave Desktop e para o armazenamento local. Os cinco valores
precisam ser iguais, e `scripts/check-bundles.mjs` e `tests/test_rename.py` conferem isso. O Hermes
recusa atualizar uma instalação Git cujo `name` mudou, e não há campo de manifesto para declarar um
nome anterior; por isso a 1.1 migra sozinha a biblioteca e as opções da 1.0
([Migração](MIGRATION.md#da-10-para-a-11)).

## Metade do agente

| Recurso do Hermes | Uso no Atlas | Sem o recurso |
| --- | --- | --- |
| Manifesto v2 (`manifest_version: 2`, `provides_tools`, `provides_hooks`, `config_schema`) | Declara as 7 ferramentas, o gancho e as opções editáveis em `hermes plugins config` e no formulário do Desktop. | Campos desconhecidos são ignorados por versões antigas. |
| `ctx.register_tool` | `atlas_components`, `atlas_render`, `atlas_update`, `atlas_get`, `atlas_list`, `atlas_export`, `atlas_resources` no toolset `atlas`. `atlas_resources` tem `check_fn` ligado à opção `resources_tool`. | — |
| `ctx.register_hook("pre_llm_call")` | Nota única quando o usuário mudou um canvas do agente. | — |
| `ctx.register_skill` | `atlas-intelligent-ui:canvas`. | O registro é ignorado; as ferramentas continuam autoexplicativas. |
| `ctx.register_command` | `/atlas` em qualquer superfície. | Comando ausente. |
| `ctx.register_cli_command` | `hermes atlas …`. | Comando ausente. Com `plugins.isolation: host`, o Hermes não registra comandos de terminal de plugins; use `python -m hermes_atlas`. |
| `ctx.get_config` | Lê as opções a cada chamada, sem reiniciar. | Lê `plugins.entries.atlas-intelligent-ui.settings` por `load_config_readonly`. |
| `ctx.session_surface()` | Sabe se a conversa é Desktop, terminal ou app de mensagem. | Usa `HERMES_SESSION_PLATFORM`; sem nenhum dos dois, `show: "either"`. |
| `ctx.turn_client()` (0.23) | Separa o Hermes Desktop e o Webapp (`hermes-desktop`, `hermes-webapp`) de outros apps que abrem sessões `gui` (o portal Atlas): só os primeiros recebem o arquivo `MEDIA:`. | Comportamento da 1.1.1: superfície `desktop` sempre recebe o arquivo. |
| `ctx.register_rpc` (0.23) | `plugin.atlas-intelligent-ui.http`: a API do Atlas pelo gateway, no perfil dono da sessão. A extensão do Desktop usa isso antes de `ctx.rest`, porque o dashboard do 0.23 só serve rotas de plugins da comunidade no perfil com que foi iniciado (PLG-3). | A extensão usa `ctx.rest` (funciona no perfil de lançamento). |
| `broadcast_plugin_event` / `ctx.emit_to_session` | Avisa as interfaces quando um canvas muda. | As interfaces consultam o servidor. |
| Entrega `MEDIA:` | `atlas_export` e o modo `file` anexam a página HTML do canvas. | — |

O Atlas importa do Hermes apenas nomes da lista pública de `plugin_api.json`:
`agent.secret_scope.get_secret`, `hermes_constants.get_hermes_home`,
`plugins.plugin_storage.plugin_data_dir`, `hermes_cli.config.load_config_readonly`,
`gateway.session_context.get_session_env` e `hermes_cli.plugin_events.broadcast_plugin_event`.
Cada import é protegido: fora do Hermes (testes, app independente) o Atlas usa equivalentes.

**Dependências.** O Hermes já traz pydantic, FastAPI, httpx e uvicorn; o Atlas não declara
`python_dependencies`, então a instalação não pede consentimento de dependências nem reinício
por causa delas.

**Isolamento.** Com `plugins.isolation: host`, ferramentas, gancho e rotas funcionam no processo
de plugins do Hermes. As rotas do Atlas respondem JSON por consulta, sem streaming nem websocket,
o que esse modo exige.

## Aba do dashboard

| Recurso | Uso |
| --- | --- |
| `dashboard/manifest.json` + `plugin_api.py` com `router` | Aba **Atlas** depois de **Chat**; rotas em `/api/plugins/atlas-intelligent-ui/`. O `plugin_api.py` é carregado por caminho, como módulo de nível superior, e reaproveita o pacote já importado pelo agente quando é o mesmo arquivo. |
| `window.__HERMES_PLUGIN_SDK__` | `React` do dashboard (o bundle não traz React próprio), `authedFetch` (ou `fetchJSON` em versões antigas) e `useI18n()` (SDK 1.1). |
| Variáveis de tema (`--background-base`, `--color-card`, `--color-primary`…) | Todas as cores do Atlas. |

## Extensão do Desktop e do Webapp

`desktop/plugin.js` importa o SDK por namespace (`import * as sdk`) e testa cada membro antes de
usar, porque um import nomeado que o Desktop em execução não tenha derrubaria o módulo inteiro.

| Membro do SDK | Uso | Sem ele |
| --- | --- | --- |
| `ROUTES_AREA`, `SIDEBAR_NAV_AREA` | Página `/atlas` e item na barra lateral. | Usa os nomes `routes` e `sidebar.nav`. |
| `TOOL_MEDIA_RENDERER_AREA` | Troca o cartão do arquivo de `atlas_render`/`atlas_update` pelo canvas vivo. | O aperto de mão informa a ausência e as ferramentas passam a pedir a diretiva. |
| `TRANSCRIPT_DIRECTIVE_AREA` | Desenha `::atlas{id rev}` na conversa. | A linha fica como texto; as ferramentas pedem o arquivo ou texto. |
| `host.composer.insertText`, `focus` | Botões do canvas colocam texto no campo de mensagem **da conversa daquele canvas**. | Copia para a área de transferência. |
| `host.composer.submit` / `host.request("prompt.submit")` | O chat da página Atlas pode enviar para a sessão aberta no Desktop. | Recusa com explicação. |
| `host.state.profile`, `gateway`, `focusedSessionId`, `useValue`, `gatewayActivationEpoch` | Recarrega a biblioteca ao trocar de perfil ou de gateway e descarta respostas de uma conexão antiga. | Lê uma vez. |
| `host.navigate`, `host.notify` | “Abrir no Atlas” e avisos. | Botão oculto, sem aviso. |
| `ctx.rest`, `ctx.onEvent`, `ctx.onDispose` | Chamadas à API do plugin, eventos `plugin.atlas-intelligent-ui.*`, limpeza do CSS. | — |

O `plugin.js` obedece à análise de catálogo do Hermes (`hermes plugins validate`): nenhum
`eval`, `new Function`, `import()` fora do SDK, injeção de `<script>`, observação do `body` ou
acesso a marcações internas do aplicativo. `scripts/check-bundles.mjs` reproduz essa análise.

## Chat do próprio Atlas

Usa o servidor de API do Hermes: `GET /v1/capabilities` (exige execuções com idempotência
persistente), `POST /v1/runs`, eventos SSE, parada, aprovação, esclarecimento e resolução de
resultado desconhecido, e rotas `/p/<perfil>/v1` para perfis secundários.

## Como foi verificado

- **Contrato do host.** `tests/hermes_host.py` reproduz o carregamento do Hermes: importa o
  plugin como `hermes_plugins.atlas_intelligent_ui` por `spec_from_file_location`, sem o diretório
  no `sys.path`, e repassa às ferramentas e ao gancho só os argumentos que o Hermes repassa.
- **Migração da 1.0.** `tests/test_rename.py` cria uma biblioteca na pasta da 1.0 e confere a
  cópia na primeira abertura, a leitura somente-leitura antes dela, a trava entre processos, uma
  biblioteca antiga ilegível, as opções herdadas e os avisos de restos da instalação anterior.
  `tests/test_plugin_contract.py` confere o manifesto, as declarações, os imports permitidos e os
  limites da varredura de instalação (até 400 arquivos, 10 MB no total, 1 MiB por arquivo,
  nenhum binário).
- **Ferramentas e API.** Testes de cada ferramenta e rota, com a biblioteca isolada num diretório
  temporário (nenhum teste toca o `HERMES_HOME` real).
- **Interfaces.** Testes da extensão contra um duplo do SDK do Desktop (registro, diretiva,
  renderizador de mídia, inserção no campo de mensagem sem envio automático, idioma, eventos), do
  canvas embutido (rascunho, versão, descarte, conflito), do tema e da cobertura das traduções.
- **No navegador.** As três interfaces foram abertas com páginas de teste (`harness/`) que
  carregam os bundles compilados, simulam o SDK e o tema de cada host e falam com um servidor
  Atlas real numa pasta isolada. As capturas em `docs/screenshots/` vêm dessas páginas.
- **Integração contínua.** Cada push roda os testes de interface, compila os bundles e confere
  que os arquivos versionados estão atualizados; roda os testes Python no 3.11 e no 3.14, a
  versão das instalações atuais do Hermes; e instala o Hermes Agent em Linux pelo instalador
  oficial (última versão estável), para rodar `hermes plugins validate` e
  `hermes plugins doctor --ci` neste repositório e, depois, instalar o checkout com
  `hermes plugins install`, ligá-lo e usar `hermes atlas migrate`, `doctor` e `status`.

**Limites desta verificação.** O Atlas não foi aberto dentro de um Hermes Desktop real antes da
publicação: o Hermes não roda na máquina de desenvolvimento. O comportamento dentro do host foi
verificado pelos testes de contrato, pelas páginas de teste, pelo `validate`/`doctor`/`install` do
próprio Hermes no CI e pelo `doctor` de uma instalação real. Relate qualquer diferença em
[Issues](https://github.com/sesantanajr/hermes-atlas-intelligent-ui/issues).
