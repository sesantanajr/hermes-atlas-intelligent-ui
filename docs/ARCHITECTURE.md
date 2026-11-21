# Arquitetura 0.2

## Superfícies

O mesmo App React atende o standalone (Vite), o dashboard (IIFE com React do host) e o Desktop/Webapp (ESM usando apenas imports oficiais do SDK). O Desktop usa `ctx.rest` autenticado; o dashboard usa seu cliente SDK. A API local tem restrição de Host, origem, JSON e CSP.

`plugin.yaml` e o registro Python expõem `atlas_render`, `atlas_list` e `atlas_get`. `dashboard/plugin_api.py` monta o mesmo router do standalone com imports relativos isolados. O wheel contém `atlas/static` e `atlas/plugin`; a compilação recusa publicar pacote sem esses assets.

## Execução durável

1. O cliente cria um UUID de pedido e envia texto, anexos e canvas ativo.
2. A API verifica capacidades oficiais, valida tamanhos e reserva a conversa/execução no SQLite em uma transação.
3. Um observador envia `POST /v1/runs` com chave de idempotência estável. O histórico continua no Hermes; cada turno envia só o novo conteúdo e instruções compactas.
4. SSE acumula deltas, sequência, progresso e controles; consultas de status confirmam o resultado. Snapshots são persistidos a cada ciclo de aproximadamente 500 ms.
5. A tela consulta o snapshot, adaptando a frequência à visibilidade. Reabrir a tela recupera a execução persistida.
6. Conclusão, mensagem de resposta e desbloqueio da conversa são transacionais. Artefatos possuem deduplicação por execução e revisão fixada na mensagem.

Falha no POST não prova que o Hermes recusou o pedido: a mesma chave é reutilizada dentro da janela durável anunciada. Após 23 horas de admissão não confirmada o Atlas deixa o resultado como desconhecido, sem repetir a operação. Reiniciar o Atlas encerra os observadores locais, não o agente. Consultar a execução reativa o observador do mesmo ID.

## Perfis e propriedade

O caminho do banco, endpoint e identidade de credencial compõem um hash de workspace. Requisições da UI levam esse hash por header ou query no Desktop; divergências são recusadas. Segredos são resolvidos pelo contexto de perfil nativo. A troca de gateway é protegida pelo epoch do SDK e por remontagem da UI.

O armazenamento nativo de canvases é por diretório do perfil; conversas e workspace possuem ainda owner hash. Rotacionar credenciais muda esse owner, isolando o histórico conversacional anterior. O banco não é um serviço multiusuário.

Sessões API Atlas não se fazem passar por sessões Desktop/CLI. O envio explícito ao chat nativo usa o RPC `prompt.submit`, verifica a sessão focada/perfil e mantém ID de submissão estável durante uma tentativa de reenvio.

## Protocolo e estado

O protocolo aceita apenas os tipos de bloco declarados em `models.py`. JSON é extraído com `JSONDecoder.raw_decode`, preservando cercas dentro de strings. Conteúdo inválido permanece texto com aviso. Resposta vazia produz erro; nenhum canvas demonstrativo substitui uma falha do modelo.

O canvas contém definição, valores de calculadora, estado de checklists/tabelas/comparações/formulários e fontes. Todos os controles são React controlados. O rascunho é salvo com debounce e fila serial. Salvar uma revisão exige a revisão-base, evitando sobrescrita concorrente. Uma nova criação recebe ID único.

Formulários geram texto no editor para revisão humana. Fórmulas são operações enumeradas, sem eval. Markdown não executa HTML; imagens remotas não são buscadas automaticamente. Links de fontes são explícitos. O renderer não aceita código gerado.

## Custos e operação

Pool HTTPX por event loop, cache curto de capabilities, limites de resposta/frame/payload e escrita agrupada evitam uma conexão ou transação por token. A UI recebe até 60 eventos recentes; não é um log de auditoria integral. As medidas locais e do provedor estão em VALIDATION.md e não são um benchmark entre modelos.

O standalone é uma aplicação pessoal loopback. O host Hermes fornece autenticação e isolamento de perfis na instalação nativa. Não há serviço de autenticação multiusuário implementado pelo Atlas.
