# Histórico de versões

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem
[SemVer](https://semver.org/lang/pt-BR/).

## [1.0.0] - 2026-11-21

Reconstrução completa para o contrato atual de plugins do Hermes Agent. A biblioteca, o formato
dos canvases (`schema_version` 1.0) e os 73 tipos de bloco continuam os mesmos: canvases salvos
na 0.6 abrem sem conversão. [Como migrar](docs/MIGRATION.md).

### Novo

- **Canvas vivo na conversa do Hermes Desktop e do Webapp.** As ferramentas gravam o canvas como
  página HTML e pedem ao modelo a linha `MEDIA:`, que toda superfície do Hermes entende; a
  extensão troca o cartão do arquivo pelo canvas interativo (`TOOL_MEDIA_RENDERER_AREA`). Em
  Desktops anteriores, a extensão desenha a diretiva `::atlas{id rev}`.
- **O agente vê o que você fez.** Interações num canvas viram rascunho no servidor;
  `atlas_get` devolve o estado e `unsaved_user_changes`; o gancho `pre_llm_call` avisa o agente,
  uma única vez, quando você muda um canvas dele.
- **Novas ferramentas** `atlas_update` (mudanças parciais com `expected_revision`, sem reenviar o
  canvas) e `atlas_export` (HTML interativo, Markdown ou JSON, com a linha `MEDIA:` para anexar).
  `atlas_get` ganhou as visões `outline` e `text` e a leitura de blocos específicos.
- **Apresentação por superfície**: canvas vivo no Desktop, texto no terminal e nos apps de
  mensagem, página HTML sob demanda. Opção `reply_style` para forçar um modo.
- **Skill `hermes-atlas:canvas`**, comando **`/atlas`** em qualquer superfície e
  **`hermes atlas`** no terminal (`status`, `list`, `show`, `export`, `doctor`, `serve`).
- **Opções do plugin** (`hermes plugins config hermes-atlas` e o formulário do Desktop):
  `reply_style`, `context_hints`, `resources_tool`, `locale`.
- **Inglês**, além do português: interface, mensagens do servidor, `/atlas` e exportações.
  O idioma segue o do Hermes.
- **Temas do Hermes**: as cores vêm das variáveis do tema do host, inclusive temas
  personalizados; claro ou escuro é medido do fundo pintado atrás do Atlas.
- **Página exportada autossuficiente**: um arquivo HTML interativo com CSP que fixa o script por
  hash e não acessa a rede.
- **Representação em texto dos 73 tipos de bloco**, usada no terminal, nos apps de mensagem e em
  `atlas_get(view="text")`.
- `hermes atlas doctor`: diagnóstico só leitura da instalação, da biblioteca e, com `--live`, da
  conexão com o servidor de API.

### Mudou

- **Nenhuma dependência Python declarada.** O Hermes já traz pydantic, FastAPI, httpx e
  uvicorn; a instalação não pede mais consentimento de dependências nem reinício por causa delas,
  e vários perfis podem ter o plugin sem conflito.
- **Inicialização ~35× mais leve**: `register()` caiu de cerca de 650 ms para cerca de 19 ms e
  não importa mais FastAPI, Starlette, httpx nem pydantic (`scripts/benchmark.py`).
- Pacote Python reorganizado em `hermes_atlas/` (`schema`, `storage`, `render`, `agent`,
  `server`, `chat`), só com imports relativos e somente APIs públicas do Hermes.
- A extensão do Desktop importa o SDK por namespace e detecta cada recurso, então carrega em
  qualquer Desktop com o carregador de plugins; o CSS é embutido e removido ao descarregar.
- Os botões de um canvas na conversa colocam o texto no campo de mensagem **daquela** conversa
  (`host.composer.insertText`) e nunca enviam sozinhos.
- Interface reescrita sobre tokens de tema; os estilos dos blocos não têm mais cores fixas.
- Exportação e chat próprio do Atlas recebem as mensagens do servidor traduzidas.
- O wheel independente (opcional) é gerado de uma cópia preparada (`scripts/build_wheel.py`);
  a raiz do repositório é só o plugin.

### Corrigido

- A extensão do Desktop importava membros do SDK por nome: num Desktop sem um deles, o módulo
  inteiro deixava de carregar. Agora cada membro é detectado antes do uso.

### Removido

- `setup.py`, `MANIFEST.in`, `scripts/start.*` e `hermes-atlas install-plugin`: o Hermes instala o
  plugin pelo Git (`hermes plugins install`).
- `python_dependencies` do manifesto.
- Notas de versão separadas da 0.x (`docs/0.*.md`); o resumo está abaixo.

### Verificação

Testes Python (contrato de carregamento do Hermes, ferramentas, API, renderização em texto,
distribuição) e de interface (extensão do Desktop contra um duplo do SDK, canvas embutido,
traduções, tema). As três interfaces foram conferidas no navegador com páginas de teste que
carregam os bundles reais. O CI instala o Hermes Agent e roda `hermes plugins validate` e
`hermes plugins doctor --ci`. A 1.0 não foi executada dentro de um Hermes Desktop real antes da
publicação; veja [Compatibilidade](docs/COMPATIBILITY.md).

## [0.6.0] - 2026-11-21

Resultado de cada etapa na conversa, inclusive quando uma ferramenta falha e o Hermes entrega a
resposta; ferramenta `atlas_resources` (disco, memória, swap e carga); prévias de formulário do
catálogo que funcionam; instalações Git em vários perfis que compartilham o `uv`.

## [0.5.1] - 2026-11-21

Turnos concluídos sem texto (`[SILENT]`) deixam de aparecer como resposta; menos consultas
repetidas durante uma execução.

## [0.5.0] - 2026-11-21

De 15 para 73 tipos de bloco em oito categorias, com validação, componente, exemplo e catálogo
navegável; ferramenta `atlas_components`.

## [0.4.0] - 2026-11-21

Blocos interativos de dados, espaço e estudo (séries, mapa, rota, flashcards, linha do tempo,
formulários ampliados).

## [0.3.0] - 2026-11-21

Coleções interativas (ordenar, selecionar, comparar) e espaços de trabalho recuperáveis por
perfil e gateway.

## [0.2.0] - 2026-11-21

Execuções duráveis pela Runs API, interface nativa no Desktop e canvases persistentes com
revisões.

## [0.1.0] - 2026-11-21

Primeira versão: plugin, aba do dashboard e espaço de trabalho com canvases.

[1.0.0]: https://github.com/sesantanajr/hermes-atlas-intelligent-ui/compare/v0.6.0...v1.0.0
[0.6.0]: https://github.com/sesantanajr/hermes-atlas-intelligent-ui/releases/tag/v0.6.0
