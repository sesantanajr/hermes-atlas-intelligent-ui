# Arquitetura 0.3

## Superfícies

O mesmo App React atende o standalone (Vite), o dashboard (IIFE com React do host) e o Desktop/Webapp (ESM usando apenas imports oficiais do SDK). O Desktop usa `ctx.rest` autenticado; o dashboard usa seu cliente SDK. A API local tem restrição de Host, origem, JSON e CSP.

`plugin.yaml` e o registro Python expõem `atlas_render`, `atlas_list` e `atlas_get`. `dashboard/plugin_api.py` monta o mesmo router do standalone com imports relativos isolados. O wheel contém `atlas/static` e `atlas/plugin`; a compilação recusa publicar pacote sem esses assets.

## Execução durável

1. O cliente cria um UUID de pedido e envia texto, anexos e canvas ativo.
2. A API verifica capacidades oficiais, valida tamanhos e reserva a conversa/execução no SQLite em uma transação.
3. Um observador envia `POST /v1/runs` com chave de idempotência estável. O histórico continua no Hermes; cada turno envia só o novo conteúdo e instruções compactas.
4. SSE acumula deltas, sequência, progresso e controles. Consultas de status confirmam o resultado. O observador verifica o estado aproximadamente a cada 500 ms e grava quando detecta mudanças.
5. A tela consulta o snapshot, adaptando a frequência à visibilidade. Reabrir a tela recupera a execução persistida.
6. Conclusão, mensagem de resposta e desbloqueio da conversa são transacionais. Artefatos possuem deduplicação por execução e revisão fixada na mensagem.

Se o POST perder a resposta, a recuperação usa a mesma chave dentro de uma janela conservadora baseada na retenção anunciada pelo Hermes. Quando a janela expira sem confirmação, o Atlas apresenta o resultado como desconhecido. O usuário pode reconhecer o encerramento local de um pedido sem ID remoto. Consultar uma execução confirmada reativa o observador do mesmo ID.

## Perfis e propriedade

O SQLite associa o diretório do perfil Hermes e o endereço do gateway a um identificador persistente de workspace. A UI envia esse identificador ao backend. Conversas, sessões, rascunhos e revisões de canvas continuam no mesmo workspace após a rotação da chave. Perfis ou gateways distintos têm bibliotecas independentes, inclusive quando compartilham `ATLAS_DATA_DIR`.

Ao atualizar a v0.2, abra o Atlas pela primeira vez com o perfil, o endpoint e a chave anteriores para conservar os IDs de sessão e de idempotência no Hermes. O Atlas recupera as revisões referenciadas pelo histórico ou pelo workspace. No diretório padrão do perfil, um único proprietário verificado também recupera as revisões manuais. Se o perfil usava apenas `atlas_render` e o banco contém somente canvases, o primeiro acesso pelo gateway local padrão recupera a biblioteca.

Em um diretório compartilhado ou com histórico de proprietário desconhecido, as revisões sem vínculo permanecem na tabela original. Para recuperar uma delas, abra uma cópia do `atlas.db` em SQLite e consulte `SELECT id,revision,title,payload FROM canvases ORDER BY id,revision`. Revise o JSON de `payload` e use a ferramenta `atlas_render` no perfil de destino com esse canvas e um novo ID. Isso inicia um novo histórico de revisões no destino.

Sessões API Atlas não se fazem passar por sessões Desktop/CLI. O envio explícito ao chat nativo usa o RPC `prompt.submit`, verifica a sessão focada/perfil e mantém ID de submissão estável durante uma tentativa de reenvio.

## Protocolo e estado

O protocolo aceita apenas os tipos de bloco declarados em `models.py`. JSON é extraído com `JSONDecoder.raw_decode`, preservando cercas dentro de strings. Conteúdo inválido permanece texto com aviso. Resposta vazia produz erro; nenhum canvas demonstrativo substitui uma falha do modelo.

O canvas contém a definição dos blocos, o estado dos controles e fontes opcionais. A coleção guarda IDs estáveis da seleção. A prévia decodifica um prefixo limitado e valida os blocos concluídos. O rascunho é salvo com debounce e fila serial. O cliente 0.3 envia o token da última gravação e oferece resolução explícita de conflito entre abas. As revisões da biblioteca exigem a revisão-base. Uma nova criação recebe ID único.

Formulários geram texto no editor para revisão humana. Fórmulas são operações enumeradas, sem eval. Markdown não executa HTML; imagens remotas não são buscadas automaticamente. Links de fontes são explícitos. O renderer não aceita código gerado.

## Custos e operação

Pool HTTPX por event loop, cache curto de capabilities, limites de resposta/frame/payload e escrita agrupada evitam uma conexão ou transação por token. A UI recebe até 60 eventos recentes; não é um log de auditoria integral. As medidas locais e do provedor estão em VALIDATION.md e não são um benchmark entre modelos.

O standalone é uma aplicação pessoal loopback. O host Hermes fornece autenticação e isolamento de perfis na instalação nativa. Não há serviço de autenticação multiusuário implementado pelo Atlas.
