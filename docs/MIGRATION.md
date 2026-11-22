# Migrar da 0.6 para a 1.0

**Seus canvases continuam.** A biblioteca fica no mesmo lugar
(`<HERMES_HOME>/plugin-data/hermes-atlas/atlas.db`), no mesmo formato de canvas
(`schema_version` 1.0) e com os mesmos 73 tipos de bloco. Na primeira abertura, o Atlas 1.0
acrescenta ao banco o que precisa, sem apagar nada. Por segurança, copie a pasta
`plugin-data/hermes-atlas` antes de atualizar.

## Atualizar

Instalação feita pelo Git (o caminho recomendado):

```sh
hermes plugins update hermes-atlas
hermes plugins doctor hermes-atlas
hermes atlas doctor
```

Depois, no Hermes Desktop, abra **Capacidades → Plugins** e confira se as chaves **Agente** e
**Desktop** do Hermes Atlas estão ligadas. Recarregue o dashboard web, se você o usa.

Se o Hermes recusar a atualização por causa das dependências que a 0.6 declarava, remova e
instale de novo; a biblioteca não é apagada:

```sh
hermes plugins remove hermes-atlas
hermes plugins install sesantanajr/hermes-atlas-intelligent-ui --enable
```

Quem usava o **wheel** (`pip install hermes-atlas-intelligent-ui` e `hermes-atlas serve`): o
wheel continua disponível para o app independente, gerado por `scripts/build_wheel.py`, mas não
instala mais o plugin. O comando `hermes-atlas install-plugin` foi removido; instale o plugin com
`hermes plugins install`.

## O que muda para você

| Na 0.6 | Na 1.0 |
| --- | --- |
| O canvas aparecia na página Atlas e no chat do Atlas. | Também aparece vivo dentro das respostas do Hermes Desktop e do Webapp, sem sair da conversa. |
| O agente criava canvases novos para cada mudança. | O agente muda só o que precisa (`atlas_update`) e lê o que você marcou (`atlas_get`). |
| No terminal e nos apps de mensagem, o modelo não sabia o que fazer com um canvas. | Ele responde em texto e anexa a página HTML quando você pede. |
| Interface só em português, com cores próprias. | Português e inglês; cores do tema do Hermes. |
| Plugin declarava dependências Python. | Nenhuma dependência: instalação e atualização sem consentimento de dependências. |

## Para quem automatiza o Atlas

- **Ferramentas.** `atlas_components`, `atlas_render`, `atlas_get`, `atlas_list` e
  `atlas_resources` continuam com os mesmos nomes. Toda resposta é um objeto JSON com
  `success`; quando falha, `error` explica ao modelo como corrigir. Veja [Ferramentas](TOOLS.md).
- **`atlas_render` sempre cria um canvas novo.** Para alterar um existente, use `atlas_update`.
  Prompts salvos da 0.x que passavam `expected_revision` e `id` ao `atlas_render` continuam
  funcionando por compatibilidade.
- **API HTTP** (`/api/plugins/hermes-atlas/…`): as rotas da 0.6 continuam. Novas rotas:
  `POST /clients/{kind}`, `DELETE /canvases/{id}`, `GET|PUT|DELETE /canvases/{id}/draft`,
  `GET /canvases/{id}/text` e `GET /canvases/{id}/export?format=html|markdown|json`.
- **Módulo Python** `atlas` passou a se chamar `hermes_atlas`, organizado em subpacotes (veja a
  [Arquitetura](ARCHITECTURE.md)).
