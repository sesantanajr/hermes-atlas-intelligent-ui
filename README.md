![Hermes Atlas · Intelligent UI. Um cartógrafo conecta um globo a cartões interativos.](docs/hermes-atlas-cover.jpg)

# Hermes Atlas · Intelligent UI

[![Verificações](https://github.com/sesantanajr/hermes-atlas-intelligent-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/sesantanajr/hermes-atlas-intelligent-ui/actions/workflows/ci.yml)
![Versão](https://img.shields.io/badge/vers%C3%A3o-1.0.0-0b7a5c)
![Hermes Agent](https://img.shields.io/badge/Hermes%20Agent-%E2%89%A5%200.21-1f2937)
![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-informational)

[English](README.en.md)

**Canvases interativos para o [Hermes Agent](https://github.com/NousResearch/hermes-agent).** Peça
uma comparação, um plano, um orçamento ou um painel, e o agente responde com um canvas que você
marca, filtra, ajusta e preenche: dentro da própria conversa no Hermes Desktop, numa aba do
dashboard web ou como uma página HTML. Na mensagem seguinte, o agente já sabe o que você mudou.

![Um canvas "Lisboa em 6 dias" dentro de uma resposta no Hermes Desktop, com orçamento, checklist e gastos ajustáveis](docs/screenshots/desktop-conversation.png)

**Versão 1.0.0**: reconstrução completa para o contrato atual de plugins do Hermes Agent.
[O que mudou](CHANGELOG.md) · [Migrar da 0.6](docs/MIGRATION.md)

## Destaques

- **73 tipos de bloco** em oito categorias: gráficos, tabelas filtráveis, formulários,
  checklists, mapas, rotas, kanban, calculadoras, quizzes, flashcards, orçamentos e mais.
  Tudo é JSON declarativo validado: o modelo não escreve HTML nem JavaScript.
- **Ida e volta com o agente.** O que você faz no canvas vira um rascunho que o agente lê com
  `atlas_get`, e o Hermes o avisa, uma única vez, quando você mexe num canvas que ele criou.
  Para mudar uma parte, o agente edita só aquela parte (`atlas_update`), sem reenviar o canvas.
- **Nativo em cada superfície do Hermes**: canvas vivo na conversa do Desktop e do Webapp,
  aba no dashboard, resumo em texto no terminal e nos apps de mensagem, e a página interativa
  como anexo quando você pedir.
- **Leve**: nenhuma dependência Python ou Node para instalar. O `register()` acrescenta cerca de
  19 ms à inicialização do Hermes; a 0.6 levava cerca de 650 ms
  ([medição](docs/benchmark.json)).
- **Seguro por construção**: ações de um canvas só preparam mensagens que você revisa; a página
  exportada não acessa a rede; credenciais ficam no servidor. [Detalhes](docs/SECURITY.md)
- **Português e inglês**, seguindo o idioma do Hermes, e as cores do tema do Hermes, claro,
  escuro ou personalizado.

## Instalar

Requer **Hermes Agent 0.21.0** ou mais recente. Não é preciso Node nem pacotes Python extras:
os bundles da interface já vêm no repositório.

```sh
hermes plugins install sesantanajr/hermes-atlas-intelligent-ui --enable
```

Sem `--enable`, o Hermes instala o plugin desligado; ligue com `hermes plugins enable hermes-atlas`.

- **Hermes Desktop e Webapp**: em **Capacidades → Plugins**, o Hermes Atlas ocupa uma linha com
  duas chaves. **Agente** liga as ferramentas, o comando `/atlas` e a skill; **Desktop** liga o
  canvas na conversa e a página **Atlas** na barra lateral. Ligue as duas. Você também pode
  instalar por ali: **Capacidades → Plugins → Instalar** com
  `sesantanajr/hermes-atlas-intelligent-ui`.
- **Dashboard web**: a aba **Atlas** aparece ao recarregar o dashboard. Se a sua versão não
  recarrega plugins sozinha, reinicie `hermes dashboard`.
- **Lista explícita de toolsets**: se a sua configuração usa uma, inclua `atlas`.

Conferir, atualizar e remover:

```sh
hermes plugins doctor hermes-atlas
hermes atlas doctor
hermes plugins update hermes-atlas
hermes plugins remove hermes-atlas   # a biblioteca em plugin-data/hermes-atlas é mantida
```

## Usar

Peça como pediria a uma pessoa:

- “Compare três notebooks de até R$ 6 mil num canvas, com uma tabela e uma nota para cada um.”
- “Monte um orçamento de viagem para Lisboa que eu possa ajustar.”
- “Crie flashcards e um quiz sobre a Revolução Francesa.”
- “Transforme este CSV num gráfico de linhas por mês.” (com o arquivo anexado)

A skill `hermes-atlas:canvas` ensina o agente a decidir quando um canvas ajuda, a escolher os
blocos e a atualizá-los. A forma de apresentar o canvas depende de onde você conversa:

| Onde você conversa | O que aparece |
| --- | --- |
| **Hermes Desktop / Webapp** com a extensão ligada | O canvas vivo dentro da resposta. Marque, ajuste e preencha ali mesmo; botões do canvas colocam o texto no seu campo de mensagem, nunca enviam sozinhos. |
| Hermes Desktop sem a extensão | Um cartão com a página interativa do canvas, que abre na pré-visualização. |
| **Dashboard web** | A aba **Atlas**: biblioteca, catálogo de blocos e uma conversa própria com o Hermes. |
| Terminal (CLI e TUI) | Um resumo em texto. `/atlas show <id>` mostra o canvas inteiro em Markdown. |
| Telegram, Discord, WhatsApp e outros | Um resumo em texto. Peça “me mande o canvas” e o agente anexa a página HTML. |

![A aba Atlas no dashboard web do Hermes, com o tema escuro do dashboard e o canvas aberto ao lado](docs/screenshots/dashboard.png)

### Comandos

Em qualquer conversa:

```text
/atlas                                  resumo e canvases recentes
/atlas list [texto]                     buscar por título
/atlas show <id ou título> [versão]     ver o canvas em texto
/atlas export <id ou título> [html|md|json]
```

No terminal: `hermes atlas status`, `list`, `show`, `export`, `doctor` e `serve`. Este último abre o
Atlas como aplicativo independente em `http://127.0.0.1:7331`, sem login próprio e só em loopback.

## Configurar

```sh
hermes plugins config hermes-atlas
```

| Opção | Padrão | O que faz |
| --- | --- | --- |
| `reply_style` | `auto` | Como o canvas entra na resposta. `auto` escolhe pela superfície (tabela acima); `file` sempre anexa a página interativa; `directive` sempre usa a linha `::atlas{…}`; `text` nunca mostra o canvas na conversa. |
| `context_hints` | `true` | Avisa o agente, uma vez, quando você muda um canvas que ele criou. |
| `resources_tool` | `true` | Oferece `atlas_resources` (disco, memória e carga da máquina do Hermes). |
| `locale` | `auto` | Idioma de `/atlas`, `hermes atlas` e das exportações: `auto` (o do Hermes), `pt-BR` ou `en`. |

O chat próprio do Atlas (dashboard e aplicativo independente) usa o servidor de API do Hermes.
Habilite-o no perfil com `API_SERVER_ENABLED=true` e `API_SERVER_KEY`; o endereço padrão é
`http://127.0.0.1:8642/v1`, e perfis secundários usam `/p/<perfil>/v1`. Canvases, biblioteca,
ferramentas e o canvas na conversa do Desktop funcionam sem ele.

## Ferramentas do agente

| Ferramenta | Para quê |
| --- | --- |
| `atlas_components` | Lista os 73 tipos de bloco ou devolve o schema e um exemplo de cada tipo pedido. |
| `atlas_render` | Cria um canvas, valida e salva na biblioteca; diz ao modelo como mostrá-lo naquela superfície. |
| `atlas_update` | Muda partes de um canvas (acrescentar, trocar, remover, mover blocos, título, fontes, estado). |
| `atlas_get` | Lê um canvas com o estado atual do usuário, inteiro, em esboço ou em texto. |
| `atlas_list` | Busca na biblioteca por título. |
| `atlas_export` | Grava o canvas em HTML interativo, Markdown ou JSON e devolve a linha `MEDIA:` para anexar. |
| `atlas_resources` | Mede disco, memória, swap e carga da máquina do Hermes, só leitura. |

Parâmetros, resultados e exemplos: [docs/TOOLS.md](docs/TOOLS.md).

## Seus dados

Tudo fica em `<HERMES_HOME>/plugin-data/hermes-atlas/`: a biblioteca (`atlas.db`, SQLite, com cada
versão de cada canvas, conversas do chat do Atlas e rascunhos) e as exportações (`exports/`, as
60 mais recentes). Cada perfil do Hermes tem a sua. Nada é enviado a terceiros: o Atlas só fala
com o próprio Hermes. Faça backup desse diretório como faria com o resto do perfil.

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md): como as peças se encaixam no Hermes.
- [Compatibilidade](docs/COMPATIBILITY.md): o que o Atlas usa do Hermes, desde qual versão e como foi verificado.
- [Ferramentas](docs/TOOLS.md) · [Segurança](docs/SECURITY.md) · [Migrar da 0.6](docs/MIGRATION.md)
- [Desenvolvimento](docs/DEVELOPMENT.md): compilar, testar e ver os três hosts no navegador.
- [Histórico de versões](CHANGELOG.md)

## Licença

[MIT](LICENSE) © 2026 sesantanajr. Hermes Agent é um projeto da Nous Research; o Atlas é um
plugin da comunidade, sem vínculo oficial.
