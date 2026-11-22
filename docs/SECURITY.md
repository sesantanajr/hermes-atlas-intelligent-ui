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
`<HERMES_HOME>/plugin-data/hermes-atlas/`. O Atlas não envia nada a terceiros; só conversa com
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
