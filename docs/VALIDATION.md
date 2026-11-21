# Validação da versão 0.2.0

Validação em 21/11/2026, com prompts sintéticos e Hermes real da VPS autorizada. Referência de código do Hermes: `242315ce571cde721e717a544cf8ae6c343315cf`; runtime testado: **0.23.2**, commit `ae2a81ccc00e`. Windows/Python 3.14.7 no desenvolvimento e Linux/Python 3.14.9 na VPS. O bloqueio de execução do Hermes no Windows foi respeitado; a validação real foi transferida à VPS.

## Etapas da correção

| Etapa | Implementação e evidência |
| --- | --- |
| Integridade | Estado controlado/persistente, revisão otimista, artefato ligado à revisão exata, IDs únicos, parsing de cercas JSON robusto, resposta vazia tratada como erro. |
| Integração | Runs API, secret scope do perfil, plugin com três ferramentas, transporte SDK autenticado e distinção explícita entre sessões Atlas/API e Desktop. |
| Continuidade | Idempotência durável, deltas, progresso, cancelamento confirmado, reanexação após reinício, controles de aprovação/clarificação/resultado desconhecido. |
| Interface generativa | Formulários revisáveis, fontes, Markdown, anexos textuais, temas e layout adaptável; alternativas documentadas no ADR. |
| Distribuição e medidas | Bundles completos, wheel instalável fora do checkout, benchmark reproduzível e workflow CI. |

## Testes automatizados

- Python: 24 testes, incluindo contrato nativo das três ferramentas, schema estrito, parsing, segurança do host/origem, persistência, concorrência, revisão/deduplicação e controles de runs.
- TypeScript: 11 testes, incluindo fórmulas, interação/remontagem/exportação, formulários, gráficos negativos, recuperação visual e preservação da identidade do pedido depois de queda do backend.
- Regressão de conversa longa: 26 turnos / 52 mensagens, sem reenviar o histórico nem provocar o antigo limite de 50 mensagens por pedido.
- Build TypeScript/Vite, IIFE e ESM; instalação do wheel em ambiente temporário fora do checkout, comando install-plugin, HTML e asset JavaScript servidos com sucesso.
- Auditoria npm registrada durante a validação: nenhuma vulnerabilidade reportada. Isso não é uma auditoria externa de segurança.

## Testes com o Hermes real

- Criação de calculadora validada a partir de resposta do modelo: sucesso; resultado inicial 2 + 3 = 5.
- Continuidade de sessão entre dois pedidos: sucesso; código sintético lembrado sem reenvio local da mensagem anterior.
- Repetição da mesma chave antes/depois da conclusão: mesmo run, sem duplicar as mensagens.
- Cancelamento: estado remoto `cancelled` confirmado.
- Reinício somente do servidor de teste Atlas durante uma resposta: mesmo ID remoto recuperado, uma única mensagem final. O gateway Hermes continuou em execução.
- Backend nativo do plugin sob autenticação do Hermes: `/api/plugins/hermes-atlas/status` retornou conectado, modelo configurado e capacidades reais. Segredos não foram enviados ao navegador.
- Plugin Doctor real: descoberta, importação e registro das três ferramentas aprovados, sem aviso de bundle desatualizado após rescan.
- Extensão ativada no Hermes Webapp real; página Atlas conectada e mensagem enviada pela interface usando `ctx.rest`, com resposta confirmada do modelo.
- Interface observada em 1280 px e 390 px, temas claro/escuro, biblioteca e calculadora real reaberta. Sem overflow horizontal nas telas medidas. O estado de controles também foi preservado ao alternar JSON e recarregar.

Medidas pontuais (latência de rede, provedor e ambiente estão incluídos; amostra pequena, não SLA):

| Cenário | Tempo observado |
| --- | ---: |
| Primeiro turno sintético | 6,795 s |
| Segundo turno com continuidade | 4,253 s |
| Cancelamento até confirmação | 6,805 s |
| Primeira parcela no teste de recuperação | 8,678 s |
| Resposta longa com reinício do Atlas | 47,194 s |

## Eficiência local

[benchmark.json](benchmark.json), gerado por `scripts/benchmark.py`, registra 100 gravações com quatro workers: 100 revisões distintas, mediana de 4,653 ms por escrita, p95 de 87,953 ms e leitura mediana de 0,433 ms neste Windows. Não mede uma carga multiusuário de produção.

Instruções compactas: 1.165 bytes, ante 8.970 bytes do schema completo atual. São bytes, não tokens. O histórico permanece no Hermes, reduzindo repetição no transporte Atlas. O primeiro exemplo real ainda consumiu 19.217 tokens de entrada do runtime completo do Hermes; instruções do agente e ferramentas também têm custo.

Bundles minificados sem gzip: standalone aproximadamente 438 KB, dashboard 209 KB, Desktop 238 KB. Markdown/GFM explica parte do crescimento frente à v0.1. React não é duplicado nas extensões do host.

## Limites da evidência

Os testes reais não exercitaram todos os provedores, perfis secundários ou plataformas do Hermes. Aprovação, esclarecimento e resolução de resultado desconhecido têm testes de contrato, sem provocar ações perigosas no gateway. Não existe garantia de funcionalidade total de todo o ecossistema, ausência de bugs, paridade com ChatGPT/OpenUI ou superioridade de desempenho.

O frontend recebe snapshots frequentes; somente o backend usa SSE. O canvas aparece após validação completa. Áudio e realtime voice foram anunciados como indisponíveis pela API da VPS. Voz, anexos multimodais e colaboração não foram implementados nesta versão.

## Reprodução

Execute os comandos de teste do README. `scripts/verify-live.py` usa apenas prompts sintéticos, mas consome o provedor e deixa conversas de teste no perfil escolhido. O teste de recuperação exige um servidor Atlas de teste separado: reinicie esse servidor durante um run e confira que o ID remoto e a contagem de respostas continuam os mesmos; não reinicie o gateway de produção para essa verificação.
