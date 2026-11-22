# Compatibilidade com o Hermes Agent

O Atlas 1.0 declara `requires_hermes: ">=0.21.0"`. Tudo o que surgiu depois disso é detectado
em tempo de execução: num Hermes mais antigo, o recurso correspondente simplesmente não aparece,
e o resto funciona.

O contrato abaixo foi conferido no código-fonte do Hermes Agent (`main`, commit `7c88e98`, de
20/11/2026) e numa instalação 0.21.1.

## Metade do agente

| Recurso do Hermes | Uso no Atlas | Sem o recurso |
| --- | --- | --- |
| Manifesto v2 (`manifest_version: 2`, `provides_tools`, `provides_hooks`, `config_schema`) | Declara as 7 ferramentas, o gancho e as opções editáveis em `hermes plugins config` e no formulário do Desktop. | Campos desconhecidos são ignorados por versões antigas. |
| `ctx.register_tool` | `atlas_components`, `atlas_render`, `atlas_update`, `atlas_get`, `atlas_list`, `atlas_export`, `atlas_resources` no toolset `atlas`. `atlas_resources` tem `check_fn` ligado à opção `resources_tool`. | — |
| `ctx.register_hook("pre_llm_call")` | Nota única quando o usuário mudou um canvas do agente. | — |
| `ctx.register_skill` | `hermes-atlas:canvas`. | O registro é ignorado; as ferramentas continuam autoexplicativas. |
| `ctx.register_command` | `/atlas` em qualquer superfície. | Comando ausente. |
| `ctx.register_cli_command` | `hermes atlas …`. | Comando ausente. Com `plugins.isolation: host`, o Hermes não registra comandos de terminal de plugins; use `python -m hermes_atlas`. |
| `ctx.get_config` | Lê as opções a cada chamada, sem reiniciar. | Lê `plugins.entries.hermes-atlas.settings` por `load_config_readonly`. |
| `ctx.session_surface()` | Sabe se a conversa é Desktop, terminal ou app de mensagem. | Usa `HERMES_SESSION_PLATFORM`; sem nenhum dos dois, `show: "either"`. |
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
| `dashboard/manifest.json` + `plugin_api.py` com `router` | Aba **Atlas** depois de **Chat**; rotas em `/api/plugins/hermes-atlas/`. O `plugin_api.py` é carregado por caminho, como módulo de nível superior, e reaproveita o pacote já importado pelo agente quando é o mesmo arquivo. |
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
| `ctx.rest`, `ctx.onEvent`, `ctx.onDispose` | Chamadas à API do plugin, eventos `plugin.hermes-atlas.*`, limpeza do CSS. | — |

O `plugin.js` obedece à análise de catálogo do Hermes (`hermes plugins validate`): nenhum
`eval`, `new Function`, `import()` fora do SDK, injeção de `<script>`, observação do `body` ou
acesso a marcações internas do aplicativo. `scripts/check-bundles.mjs` reproduz essa análise.

## Chat do próprio Atlas

Usa o servidor de API do Hermes: `GET /v1/capabilities` (exige execuções com idempotência
persistente), `POST /v1/runs`, eventos SSE, parada, aprovação, esclarecimento e resolução de
resultado desconhecido, e rotas `/p/<perfil>/v1` para perfis secundários.

## Como foi verificado

- **Contrato do host.** `tests/hermes_host.py` reproduz o carregamento do Hermes: importa o
  plugin como `hermes_plugins.hermes_atlas` por `spec_from_file_location`, sem o diretório no
  `sys.path`, e repassa às ferramentas e ao gancho só os argumentos que o Hermes repassa.
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
- **Integração contínua.** Cada push roda os testes, compila os bundles e confere que os
  arquivos versionados estão atualizados; um segundo job instala o Hermes Agent do GitHub em
  Linux e roda `hermes plugins validate` e `hermes plugins doctor --ci` neste repositório.

**Limites desta verificação.** A 1.0 não foi executada dentro de um Hermes Desktop ou dashboard
real antes da publicação: o Hermes não roda na máquina de desenvolvimento. O comportamento
dentro do host foi verificado pelos testes de contrato, pelas páginas de teste e pelo
`validate`/`doctor` do próprio Hermes no CI. Relate qualquer diferença em
[Issues](https://github.com/sesantanajr/hermes-atlas-intelligent-ui/issues).
