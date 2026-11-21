# ADR: renderer e ações na versão 0.2

Data: 21/11/2026. Decisão: conservar o protocolo Atlas validado nesta versão, com estado persistente e formulários de ação revisável. A escolha é de compatibilidade e escopo, não uma alegação de que um renderer próprio supera os projetos abaixo.

| Referência | O que oferece / ensina | Aplicação ao Atlas |
| --- | --- | --- |
| [OpenUI](https://github.com/thesysdev/openui) | OpenUI Lang, bibliotecas de componentes e renderização progressiva | Boa opção para futura camada interoperável. A v0.2 mantém JSON existente; não implementa nem declara compatibilidade com OpenUI Lang. |
| [json-render](https://github.com/vercel-labs/json-render) | Catálogo tipado, registry e ações ligadas ao aplicativo | Orienta catálogo fechado, validação e separação entre apresentação e execução. Migrar agora exigiria transformar definições e revisões existentes. |
| [A2UI](https://github.com/a2ui-project/a2ui) | Layout descrito como dados, renderizado em componentes nativos de múltiplos frameworks | Útil para interoperabilidade futura; exige adaptador de protocolo e testes de equivalência, ausentes nesta versão. |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Runtime, sessões, ferramentas, perfis, controles e SDK de plugins | É a autoridade de execução. Atlas consome Runs API e SDK, sem criar um agente paralelo. |
| [hermes-webui](https://github.com/nesquena/hermes-webui) | Alternativa comunitária de interface para Hermes | Referência de produto; não é dependência nem prova de compatibilidade com o SDK Desktop atual. |
| [ChatGPT: Interface Inteligente](https://openai.com/pt-BR/index/gpt-6-for-everyone/) | Referência de experiência conversacional com respostas visuais | Inspiração de interação. Não fornece código de runtime ao Atlas nem um alvo de benchmark reproduzível neste projeto. |

## Critérios da decisão

Preservar canvases e revisões já salvos; compartilhar React com o Hermes; não executar código arbitrário vindo do modelo; manter o plugin instalável; ter controles previsíveis após reabrir a página; recuperar uma execução sem duplicá-la.

A v0.2 adiciona `form` com campos textuais, numéricos e seleção. A submissão prepara uma mensagem no editor; a pessoa revisa e envia. Estado de campo e controles faz parte do canvas exportável. Ferramentas externas permanecem no Hermes, incluindo suas aprovações.

O custo é uma biblioteca menor e ausência de renderização parcial do canvas: texto chega progressivamente, mas o JSON precisa terminar e validar antes de virar interface. Adotar OpenUI/json-render/A2UI depois requer versionar o protocolo, migrar ou adaptar os documentos e medir regressões de estado, ações, bytes, latência e memória com os mesmos casos.

## Critérios de evolução

Uma futura migração deve demonstrar conversão sem perda dos oito blocos e seus estados, preservação de revisão e fontes, React único no host, cancelamento/recuperação idênticos e ações autorizadas pelo Hermes. Voz, anexos multimodais, colaboração e histórico nativo são capacidades separadas; um renderer diferente sozinho não as implementa.
