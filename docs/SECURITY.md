# Segurança

## Relatar uma vulnerabilidade

Use o [relato privado de vulnerabilidades do GitHub](https://github.com/sesantanajr/hermes-atlas-intelligent-ui/security/advisories/new)
deste repositório (aba **Security → Report a vulnerability**). Não abra uma issue pública para isso.

## O que o Atlas protege, e como

**O modelo não executa código na sua tela.** Um canvas é JSON declarativo validado contra 73
tipos fechados: campos desconhecidos são recusados, não há HTML, script, fórmulas livres nem
estilos arbitrários. Markdown não renderiza HTML. Fórmulas de calculadora são operações
enumeradas, sem `eval`.

**Ações passam por você.** Botões e formulários de um canvas só preparam texto: na conversa do
Desktop o texto vai para o seu campo de mensagem; no chat do Atlas, para o editor. Nada é
enviado sem que você envie. Ferramentas e aprovações continuam sendo do Hermes.

**Entrada do modelo é tratada como não confiável.** Os atributos de `::atlas{…}` e os resultados
de ferramentas que chegam ao Desktop são validados (`id` com letras, dígitos, `_` e `-`; revisão
numérica); qualquer coisa diferente não é desenhada.

**Página exportada.** O HTML de `atlas_export` traz uma Content-Security-Policy que fixa o
script da página por hash (`script-src 'sha256-…'`), proíbe conexões (`default-src 'none'`), formulários e
`<base>`, e só carrega imagens e mídia por HTTPS quando o canvas as cita. Os dados do canvas
entram como JSON escapado, sem possibilidade de fechar o elemento que os contém.

**Credenciais.** A chave do servidor de API do Hermes fica no backend (secret scope do perfil ou
variável de ambiente). As interfaces chamam apenas as rotas do próprio plugin; o dashboard e o
Desktop usam a autenticação do Hermes (`authedFetch`, `ctx.rest`).

**App independente.** `hermes atlas serve` escuta só em `127.0.0.1`, aceita apenas os hosts de
loopback, recusa escritas de outra origem ou sem `Content-Type: application/json` e envia CSP,
`X-Content-Type-Options` e `Referrer-Policy`. Não tem login próprio: para acesso remoto use o
Hermes (dashboard ou Webapp) ou um túnel SSH. Um gateway remoto precisa de HTTPS.

**Seus dados ficam no perfil.** A biblioteca é um SQLite em
`<HERMES_HOME>/plugin-data/atlas-intelligent-ui/`. O Atlas não envia nada a terceiros; só conversa com
o próprio Hermes. O diagnóstico (`hermes atlas doctor`) abre a biblioteca só para leitura.

**Instalação.** O repositório passa pela varredura de instalação do Hermes: nenhum binário,
nenhum arquivo acima de 1 MiB, menos de 400 arquivos e 10 MB. A extensão do Desktop obedece à
análise de catálogo do Hermes (sem `eval`, sem `import()` dinâmico, sem injeção de script, sem
acesso ao DOM do aplicativo). Lembre que, no Hermes Desktop, plugins não rodam isolados: instale
apenas o que você revisou.

## Fora do escopo

O Atlas não protege contra um modelo que escreva texto enganoso num canvas, nem contra
ferramentas de outros plugins. As permissões de ferramentas, aprovações e o que o agente pode
fazer continuam definidos na configuração do Hermes.

## Canvas enquadrado por outro app (1.1.2)

A página do canvas (`viewer.html`) pode ser enquadrada por um app de chat num `iframe` com
`sandbox="allow-scripts allow-downloads"`, sem `allow-same-origin`. O protocolo entre os dois lados
(`postMessage`, [Arquitetura](ARCHITECTURE.md#o-canvas-enquadrado-por-outro-app)) foi feito para que
nenhum dos lados confie no outro além do necessário:

- a página só lê mensagens da janela que a enquadra e só aceita, de um estado devolvido, o que a
  pessoa poderia ter feito à mão (estado de blocos conhecidos, ordem dos mesmos blocos, valores de
  calculadora dentro dos limites); o conteúdo dos blocos vem sempre da própria página;
- o lado do app (no portal Atlas, `atlas-canvas-1273.js`) só lê mensagens do próprio quadro
  (`event.source`), limita a altura, guarda o estado como texto JSON com teto de tamanho e escreve
  o texto das ações como texto puro na caixa de mensagem, sem enviar;
- exportações são feitas dentro da página, sem rede; o CSV prefixa células que começam com
  `=`, `+`, `-` ou `@` para que uma planilha não as leia como fórmula.

## RPC de plugins (1.1.2)

`plugin.atlas-intelligent-ui.http` aceita só os caminhos da própria API do Atlas (lista fixa em
`hermes_atlas/agent/rpc.py`) e os métodos HTTP que ela usa, e reexecuta o pedido no roteador do
Atlas dentro do processo, sem rede. O gateway do Hermes já exige a capacidade `session:control` e,
quando o pedido nomeia uma sessão, a autorização dela, como para um comando de barra de plugin.
