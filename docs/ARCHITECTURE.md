# Decisões de arquitetura

O Atlas adiciona ferramentas e uma aba sem modificar arquivos do Hermes. A UI usa duas entradas: `main.tsx` com React próprio para o aplicativo local; `plugin.tsx` com React externo fornecido pelo SDK no dashboard. O bundle distribuído é IIFE, como exige o host.

## Fronteira de confiança

A saída do modelo é dado não confiável. `Canvas` proíbe propriedades extras e limita blocos, strings, números e arrays. Não existem componentes de código, HTML, iframe, URL de imagem ou ação arbitrária. React apresenta strings como texto escapado. O modelo pode sugerir conteúdo, mas não altera a lista de tipos suportados.

O servidor limita respostas do upstream a 2 MB e canvases persistidos a 256 KB. SQLite usa parâmetros e `BEGIN IMMEDIATE` para reservar revisões de forma atômica. O ID não é usado como caminho de arquivo. Dados permanecem após atualizações do plugin.

O proxy aceita somente um upstream configurado pelo operador, exige TLS para hosts remotos e não segue redirecionamentos. A chave fica em variável de ambiente e não aparece em mensagens de erro. O host independente restringe Host e Origin e não habilita CORS; o dashboard utiliza a autenticação do Hermes. Isso não transforma o standalone em serviço multiusuário.

## Persistência e interatividade

Definições de canvases são persistidas. Interações exploratórias são locais e efêmeras. Conversas são locais ao navegador. Não há sincronização entre usuários ou entre conversas nativas e o histórico do Atlas. O compartilhamento entre plugin e UI ocorre pelos canvases do mesmo perfil.

## Evolução planejada

1. Adapter de streaming oficial com eventos de ferramentas, estado terminal explícito e cancelamento por run ID.
2. Estado interativo persistido por revisão e usuário, com migração de protocolo.
3. Adaptador opcional para OpenUI Lang com biblioteca de componentes limitada.
4. Integração de aprovações do Hermes antes de disponibilizar componentes com efeitos externos.
5. Matriz CI de versões do Hermes, teste real de gateway e benchmarks reproduzíveis de latência/memória.

Esses itens são propostas; não estão implementados na versão 0.1.0.
