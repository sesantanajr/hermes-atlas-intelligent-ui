# Histórico de versões

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem
[SemVer](https://semver.org/lang/pt-BR/).

## [1.1.0] - 2026-11-22

O plugin passa a se chamar **`atlas-intelligent-ui`**: `hermes plugins doctor atlas-intelligent-ui`,
`hermes plugins update atlas-intelligent-ui`. O Hermes recusa atualizar uma instalação cujo nome
mudou, então quem tem a 1.0 (`hermes-atlas`) reinstala uma vez; a biblioteca de canvases e as
opções vêm junto sozinhas. [Como migrar](docs/MIGRATION.md#da-10-para-a-11).

### Novo

- **Um nome só em todo lugar:** pasta do plugin, opções (`plugins.entries.atlas-intelligent-ui`),
  pasta de dados, rotas `/api/plugins/atlas-intelligent-ui/`, extensão do Desktop, eventos
  `plugin.atlas-intelligent-ui.*` e skill `atlas-intelligent-ui:canvas`. Ferramentas `atlas_*`,
  toolset `atlas`, `/atlas` e `hermes atlas` não mudaram.
- **Migração automática da biblioteca.** Na primeira vez que a 1.1 abre a biblioteca num perfil,
  ela copia `plugin-data/hermes-atlas/atlas.db` com a cópia nativa do SQLite, sob uma trava entre
  processos e com troca atômica. A pasta antiga nunca é alterada nem apagada. Até a cópia,
  gancho e diagnóstico leem a biblioteca antiga.
- **Opções herdadas.** Uma opção que só existe na entrada `hermes-atlas` vale na 1.1 e é gravada
  uma vez na entrada nova, para sobreviver a `hermes plugins remove hermes-atlas`.
- **Restos da instalação anterior** aparecem em `hermes atlas doctor` e no resumo de `/atlas`:
  `plugins/hermes-atlas` ainda instalado (ele registraria as mesmas ferramentas e venceria),
  `hermes-atlas` em `plugins.enabled`, a extensão antiga do Desktop, uma cópia instalada com o nome
  antigo, ou uma cópia da biblioteca que falhou.
- **`hermes atlas serve` como serviço:** o app independente lê sozinho a chave do servidor de API
  do Hermes (`API_SERVER_KEY` no `.env` do perfil), então uma unidade systemd não precisa de um
  lançador próprio. O wheel independente ganhou o comando `atlas-intelligent-ui`; `hermes-atlas`
  continua como apelido.

### Corrigido

**No agente:**

- **A skill `canvas` ficava invisível para o modelo** em todos os sistemas: o campo `platforms`
  chegava ao filtro de plataforma do Hermes como texto e não casava com nenhum sistema. O
  frontmatter agora é lido com o YAML do próprio Hermes, e a skill vale para todos os sistemas.
- **Avisos de canvas alterado se perdiam com `plugins.isolation: host`.** As ferramentas sempre
  avisam a sessão (`ctx.emit_to_session`) e só transmitem aos Desktops quando o processo tem a
  conexão deles, como o próprio núcleo do Hermes faz.
- **Canvas duplicado depois de uma falha ao gerar a página.** Se o canvas já foi salvo e a página
  HTML não pôde ser escrita (disco cheio, permissão), a ferramenta respondia erro e o modelo tentava
  de novo; agora responde sucesso com outra forma de exibição.
- A limpeza da pasta de exportações não falha mais quando outro processo apaga um arquivo ao mesmo
  tempo.
- O gancho chamado a cada turno não pega mais a trava de escrita do SQLite quando nada mudou, e
  `/status` lê o banco fora do laço de eventos do dashboard.
- Bibliotecas novas ficam só com o dono (arquivo 0600, pasta 0700) em sistemas POSIX.
- O comando de terminal não é mais registrado dentro do processo isolado de plugins, onde o Hermes o
  ignora e registrava um aviso a cada início.

**Nas interfaces (Desktop, Webapp e dashboard):**

- Uma reconexão do Desktop ao gateway não descarta mais as edições abertas na página Atlas, e uma
  troca de fonte no mesmo perfil atualiza a página em vez de deixar todas as chamadas falhando.
- "Salvar versão" num canvas da conversa fixado numa versão não volta a mostrar a versão anterior.
- As gravações de rascunho de cada canvas da conversa entram numa fila: nenhuma edição se perde entre
  digitar, salvar versão, descartar e fechar o cartão, e uma falha ao descartar aparece.
- Só a resposta "Canvas não encontrado" é mostrada como canvas apagado. Plugin desligado, backend
  sem rota ou conexão caída mostram um erro com "Tentar de novo", e no Desktop o cartão volta a ser o
  cartão de arquivo do próprio Hermes.
- Hosts em idiomas que não são português usam inglês (antes, qualquer idioma diferente de inglês
  caía em português).
- "Enviar para a sessão" na página Atlas funciona sem um campo de mensagem visível, e o botão só
  aparece onde há como enviar.
- Erros do Desktop chegam traduzidos, sem o JSON da resposta.
- Renomear uma conversa funciona no Desktop nativo: um campo na própria lista substitui o
  `window.prompt`, que o Electron não abre.
- O idioma escolhido no Hermes não se perde quando o primeiro contato com o servidor falha.
- `scripts/check-bundles.mjs` confere que `plugin.yaml`, o manifesto do dashboard, o `id` da
  extensão, a base da API e o registro do dashboard usam o mesmo nome; examina todo
  `desktop/**/*.js` também sem tirar comentários; e avisa quando o `plugin.js` passa de 512 KB, o
  limite de versões antigas do Desktop.

### Integração contínua

- O job do Hermes instala o Hermes Agent pelo instalador oficial (o `pip install` do repositório
  passou a ser recusado pelo próprio Hermes) e roda `validate` e `doctor`; depois instala o checkout
  com `hermes plugins install`, liga o plugin e roda `hermes atlas migrate`, `doctor` e `status`. Os
  testes Python rodam no 3.11 e no 3.14.

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
