# Desenvolvimento

Requisitos: Python 3.11+ e Node 22+. As instalações atuais do Hermes rodam no Python 3.14, e o CI
testa o 3.11 e o 3.14. O Hermes Agent não é necessário para compilar e testar: os testes
reproduzem o carregamento do plugin pelo Hermes.

```sh
npm ci
python -m pip install pydantic fastapi httpx uvicorn pytest
```

## Compilar

```sh
npm run build
```

Roda, em ordem: `tsc`, o catálogo (`hermes_atlas/catalog.json` a partir de
`src/blocks/catalogData.ts`), o app independente (Vite, em `hermes_atlas/static/`), os bundles do
Hermes (`scripts/build.mjs`: `dashboard/dist/`, `desktop/plugin.js` e
`hermes_atlas/assets/viewer.html`) e as verificações dos bundles (`scripts/check-bundles.mjs`).

**Os arquivos gerados são versionados**, porque `hermes plugins install` clona o repositório e não
compila nada. Rode `npm run build` antes de cada commit que mexe em `src/`; o CI falha se os
arquivos versionados não corresponderem ao código.

## Testar

```sh
python -m pytest
npm test
```

- `tests/hermes_host.py` é um duplo do Hermes: carrega o plugin como `hermes_plugins.hermes_atlas`
  e chama ferramentas, gancho e comandos como o Hermes chama. Os testes nunca tocam o
  `HERMES_HOME` real (`tests/conftest.py` aponta tudo para pastas temporárias).
- `src/host/testing/plugin-sdk.ts` é um duplo do SDK do Desktop, ligado no lugar de
  `@hermes/plugin-sdk` só durante os testes.
- `src/i18n/*.coverage.test.ts` e `tests/test_server_messages.py` falham se algum texto da
  interface ou do servidor ficar sem tradução para o inglês.

## Ver as interfaces no navegador

```sh
hermes atlas serve          # ou: python -m hermes_atlas serve — backend em 127.0.0.1:7331
npm run dev                 # Vite em 127.0.0.1:5173, com proxy para o backend
```

Use um `HERMES_HOME` (ou `ATLAS_DATA_DIR`) de teste para não mexer na sua biblioteca. Depois abra:

| Endereço | O que mostra |
| --- | --- |
| `http://127.0.0.1:5173/` | O app independente, a partir do código-fonte. |
| `/harness/desktop.html` | O `desktop/plugin.js` compilado numa página que imita o Desktop: conversa com o canvas pelo arquivo `MEDIA:` e pela diretiva, página Atlas, temas e o campo de mensagem. Parâmetros: `canvas`, `theme`, `lang`, `route`, `only`, `clean`. |
| `/harness/dashboard.html` | O `dashboard/dist/index.js` compilado com o SDK e as variáveis de tema do dashboard. Parâmetros: `theme`, `lang`, `canvas`. |

As páginas de `harness/` carregam os bundles compilados: rode `node scripts/build.mjs` depois de
mudar o código para vê-lo ali. O duplo do SDK do Desktop (`harness/desktop-sdk.ts`) responde ao RPC
`plugin.atlas-intelligent-ui.http` repassando o pedido à API REST do backend, como o Hermes 0.23 faz
no gateway, então a página mostra o caminho que a extensão usa num Hermes atual.

Para ver o canvas enquadrado por outro app (o protocolo do quadro), gere uma página com
`hermes atlas export <id> html` (ou `render/html.py:export_html`) e sirva-a com a CSP
`sandbox allow-scripts allow-downloads` num `iframe` da sua página de teste; a página responde
`ready` e `height` assim que carrega e espera um `hello` do app.

## App independente como serviço

`hermes atlas serve` (ou `python -m hermes_atlas serve`) atende só em loopback e lê a chave do
servidor de API do Hermes como o próprio Hermes: `ATLAS_HERMES_API_KEY`, depois `API_SERVER_KEY`
do ambiente e, por último, `API_SERVER_KEY` no `.env` do perfil (`HERMES_HOME`). Uma unidade
systemd não precisa de lançador próprio nem de uma cópia da chave:

```ini
[Unit]
Description=Atlas Intelligent UI (app independente)
After=network.target

[Service]
Type=simple
UMask=0077
WorkingDirectory=/root/.hermes/plugins/atlas-intelligent-ui
Environment=HERMES_HOME=/root/.hermes
# Opcional: outra biblioteca que não a do plugin, e outra porta.
# Environment=ATLAS_DATA_DIR=/root/.hermes/plugin-data/atlas-standalone
ExecStart=/usr/local/lib/hermes-agent/venv/bin/python -m hermes_atlas serve --port 7332
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Use o Python do Hermes (ele já tem pydantic, FastAPI e uvicorn) e a pasta do plugin como
diretório de trabalho. Para abrir de outra máquina, use um túnel SSH até a porta: o app não tem
login próprio. As variáveis que o app independente entende estão em
[`standalone.env.example`](standalone.env.example).

## Outras ferramentas

| Comando | Para quê |
| --- | --- |
| `python scripts/benchmark.py --output docs/benchmark.json` | Custo do `register()`, tamanho das definições das ferramentas, SQLite e bundles. |
| `python scripts/build_wheel.py` e `python scripts/verify-wheel.py work/wheels` | Wheel opcional do app independente e sua verificação num ambiente limpo. |
| `python scripts/verify-live.py --base http://127.0.0.1:7331 --output work/live.json` | Envia pedidos sintéticos a um Hermes configurado (consome o provedor do modelo). |
| `hermes plugins validate .` e `hermes plugins doctor . --ci` | As verificações do próprio Hermes, com ele instalado. |

## Publicar uma versão

1. Atualize a versão em `hermes_atlas/__init__.py`, `plugin.yaml`, `package.json`,
   `dashboard/manifest.json` e `skills/canvas/SKILL.md`, e acrescente a entrada no
   `CHANGELOG.md` (um teste confere que todos dizem a mesma versão).
2. `npm run build`, `python -m pytest`, `npm test`.
3. Commit, tag `vX.Y.Z` e push. Quem instalou pelo Git atualiza com
   `hermes plugins update atlas-intelligent-ui`.
