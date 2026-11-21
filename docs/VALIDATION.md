# Validação da versão 0.1.0

Ambiente local: Windows, Node 26, Python 3.14. Referência Hermes: commit `242315ce571cde721e717a544cf8ae6c343315cf`.

## Verificado

- Compilação TypeScript e Vite de produção.
- Compilação IIFE do plugin sem incluir React (aproximadamente 31 KB de JavaScript minificado antes de compressão).
- 13 testes Python: tipos proibidos, campos desconhecidos, IDs duplicados, tabela malformada, concorrência de revisões, API de canvases, bloqueio de origens e Host, registro do plugin, importação da API do dashboard, proxy com transporte HTTP simulado e estados de falha/cancelamento.
- 6 testes TypeScript: fórmulas, divisão por zero, overflow, valores fracionários e operações desconhecidas.
- Auditoria npm após atualizar o Vitest: nenhuma vulnerabilidade reportada.
- Interface observada no navegador em 1440 px e 390 px, sem overflow horizontal nas telas verificadas.
- Galeria, calculadora, salvamento e leitura na biblioteca exercitados no navegador.
- Bundle distribuído carregado em um harness do SDK com React compartilhado.

## Ainda não verificado

O Windows recusou executar `hermes.exe` por uma política de Controle de Aplicativo. Não foi tentado contornar a política. Portanto, o Plugin Doctor real, o carregamento no dashboard real e uma conversa com um provedor real não foram executados nesta sessão. O teste de registro usa um contexto de contrato e o teste do proxy usa HTTP simulado.

O status local mostrou **Hermes desconectado**; isso é apresentado explicitamente na interface. Nenhum exemplo da galeria deve ser interpretado como saída de um modelo real.

O workflow CI foi incluído; seu resultado remoto deve ser conferido na aba Actions. Não há benchmark comparativo, auditoria de segurança externa, teste de carga nem garantia de compatibilidade com todas as versões do Hermes.
