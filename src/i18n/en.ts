/**
 * English for the application shell. Keys are the Portuguese strings passed to `t()` or marked
 * with `msg()` under src/app and src/host; `shell.coverage.test.ts` fails when one is missing
 * here or when an entry here is no longer used. Canvas blocks have their own table in
 * ./en.blocks.ts, and the messages the server writes are in ./en.server.ts.
 */
export const en: Record<string, string> = {
  // Navigation and views
  "Catálogo de blocos": "Block catalogue",
  Biblioteca: "Library",
  Configurações: "Settings",
  Conversa: "Chat",
  Descobrir: "Discover",
  "Nova conversa": "New chat",
  "Navegação principal": "Main navigation",
  CONVERSAS: "CONVERSATIONS",
  "Buscar conversas": "Search conversations",
  "Nenhuma conversa encontrada.": "No conversation found.",
  "Nenhuma conversa neste perfil.": "No conversations in this profile.",
  "Alternar menu": "Toggle menu",
  "Hermes conectado": "Hermes connected",
  "Hermes desconectado": "Hermes disconnected",
  "Fechar erro": "Dismiss error",
  "Fechar aviso": "Dismiss notice",
  "Painel visível": "Visible panel",
  "Carregando catálogo…": "Loading catalogue…",

  // Sending and runs
  "A execução recebida tem outra identificação.": "The run received has a different id.",
  "A execução pertence a outra conversa.": "The run belongs to another conversation.",
  "O histórico recebido pertence a outra conversa.":
    "The history received belongs to another conversation.",
  "A mensagem excede o limite de 12.000 caracteres. Reduza o texto antes de enviar.":
    "The message is over the 12,000 character limit. Shorten it before sending.",
  "Conecte o Hermes antes de enviar.": "Connect Hermes before sending.",
  "O pedido está no editor. Reenviar com o mesmo conteúdo consulta a mesma execução.":
    "Your request is back in the editor. Sending the same content again checks on the same run.",
  "Arquivo fornecido pelo usuário": "File provided by the user",
  "Canvas ativo": "Active canvas",
  "Mensagem enviada à sessão ativa do Desktop. Acompanhe a resposta no chat nativo.":
    "Message sent to the active Desktop session. Follow the reply in the native chat.",
  "Interrupção solicitada; aguardando o Hermes confirmar.":
    "Stop requested; waiting for Hermes to confirm.",
  "Decisão enviada ao Hermes.": "Decision sent to Hermes.",
  "Versão salva com suas interações.": "Version saved with your interactions.",
  "Copiado.": "Copied.",
  "Não foi possível copiar. Use a opção de exportação.":
    "Could not copy. Use the export option instead.",
  "Nome da conversa": "Conversation name",
  "Excluir esta conversa do Atlas? A sessão original permanece no Hermes.":
    "Delete this conversation from Atlas? The original session stays in Hermes.",
  'Excluir "{title}" e todas as suas versões da biblioteca? Não é possível desfazer.':
    'Delete "{title}" and all its versions from the library? This cannot be undone.',
  "Canvas excluído da biblioteca.": "Canvas deleted from the library.",
  "Use arquivos TXT, Markdown, CSV, JSON ou LOG de até 200 KB.":
    "Use TXT, Markdown, CSV, JSON or LOG files up to 200 KB.",
  "O limite é de quatro arquivos por mensagem.": "The limit is four files per message.",
  "O canvas deve ter até 256 KB.": "A canvas can be up to 256 KB.",
  "Seleção adicionada à sua mensagem no Hermes. Revise e envie.":
    "Selection added to your message in Hermes. Review and send.",
  "Seleção adicionada ao editor. Revise e envie ao Hermes.":
    "Selection added to the editor. Review and send it to Hermes.",
  "Meu canvas": "My canvas",
  "Exemplos do catálogo Atlas com dados ilustrativos.":
    "Examples from the Atlas catalogue, with illustrative data.",
  "Bloco adicionado ao canvas: {title}": "Block added to the canvas: {title}",
  "Outra aba alterou o rascunho compartilhado. Suas edições estão preservadas nesta aba.":
    "Another tab changed the shared draft. Your edits are kept in this tab.",
  "Substituir pelo meu rascunho": "Replace with my draft",
  "Usar rascunho da outra aba": "Use the other tab's draft",
  "O rascunho aguarda sincronização.": "The draft is waiting to sync.",
  "Tentar salvar novamente": "Try saving again",
  "salvando…": "saving…",
  "alterações não salvas": "unsaved changes",
  "rascunho salvo": "draft saved",

  // Canvas pane
  Rascunho: "Draft",
  "Mostrar conversa e canvas": "Show chat and canvas",
  "Ampliar canvas": "Enlarge canvas",
  "Desfazer interação": "Undo interaction",
  "Refazer interação": "Redo interaction",
  "Exportar canvas": "Export canvas",
  "Salve uma versão para exportar em HTML ou Markdown.":
    "Save a version to export as HTML or Markdown.",
  "Página HTML interativa": "Interactive HTML page",
  "Excluir canvas da biblioteca": "Delete canvas from the library",
  "Fechar canvas": "Close canvas",
  "SALVANDO INTERAÇÕES": "SAVING INTERACTIONS",
  "SEU CANVAS INTERATIVO": "YOUR INTERACTIVE CANVAS",
  "Visualização do canvas": "Canvas view",
  Interagir: "Interact",
  "Salvar versão": "Save version",
  Histórico: "History",
  "Versão do canvas": "Canvas version",
  Copiar: "Copy",

  // Chat
  "Enviando ao Hermes": "Sending to Hermes",
  "Na fila do Hermes": "Queued in Hermes",
  "Hermes trabalhando": "Hermes is working",
  "Interrompendo com segurança": "Stopping safely",
  "Aguardando sua decisão": "Waiting for your decision",
  "Execução sem desfecho confirmado": "Run with no confirmed outcome",
  "O Hermes concluiu o pedido sem enviar uma resposta.":
    "Hermes finished the request without sending a reply.",
  Você: "You",
  "Copiar mensagem": "Copy message",
  "Usar mensagem novamente": "Use message again",
  "Abrir canvas": "Open canvas",
  tokens: "tokens",
  "Renomear conversa": "Rename conversation",
  Salvar: "Save",
  Cancelar: "Cancel",
  "Exportar conversa": "Export conversation",
  "Excluir conversa": "Delete conversation",
  "Reconectando à mesma execução…": "Reconnecting to the same run…",
  "Reconhecer que esta execução foi interrompida? Verifique seus efeitos no Hermes antes de continuar.":
    "Acknowledge that this run was interrupted? Check its effects in Hermes before continuing.",
  "Reconhecer interrupção": "Acknowledge interruption",

  // Composer
  "Canvas em contexto": "Canvas in context",
  "Mensagem para o Hermes": "Message to Hermes",
  "O que vamos explorar hoje?": "What shall we explore today?",
  "Anexar texto, Markdown, CSV ou JSON": "Attach text, Markdown, CSV or JSON",
  "Anexar arquivos": "Attach files",
  "Anexar texto": "Attach text",
  "Interromper resposta": "Stop the reply",
  "Enviar mensagem": "Send message",
  "Enviar à sessão ativa do Desktop": "Send to the active Desktop session",
  "Enter para enviar · Shift + Enter para nova linha":
    "Enter to send · Shift + Enter for a new line",
  "A execução continua no Hermes": "The run continues in Hermes",

  // Home
  Crônicas: "Stories",
  Ensaios: "Essays",
  Poesia: "Poetry",
  "O que vamos explorar?": "What shall we explore?",
  "Peça ao Hermes em qualquer conversa: o canvas aparece dentro da resposta e fica guardado aqui.":
    "Ask Hermes in any conversation: the canvas appears inside the reply and is kept here.",
  "Peça algo visual ao Hermes. O canvas fica guardado na sua biblioteca e continua interativo.":
    "Ask Hermes for something visual. The canvas is kept in your library and stays interactive.",
  "Exemplos interativos": "Interactive examples",
  "Abrir e interagir": "Open and interact",
  Calcular: "Calculate",
  "Crie uma calculadora para dividir uma conta.": "Create a calculator to split a bill.",
  "Explorar dados": "Explore data",
  "Crie um gráfico para comparar duas séries de dados fictícios, com uma medição ausente.":
    "Create a chart comparing two series of made-up data, with one measurement missing.",
  Estudar: "Study",
  "Crie cartões de estudo e uma linha do tempo sobre a história da fotografia.":
    "Create flashcards and a timeline about the history of photography.",
  "Escolher itens": "Pick items",
  "Crie um catálogo de livros fictícios para eu escolher e comparar.":
    "Create a catalogue of fictional books for me to pick from and compare.",

  // Library
  "Minha biblioteca": "My library",
  "As respostas mantêm a versão original. Salve suas mudanças como uma nova versão.":
    "Replies keep the original version. Save your changes as a new version.",
  "Importar canvas JSON": "Import canvas JSON",
  "Buscar canvas": "Search canvases",
  "Buscar por título": "Search by title",
  "Versão {n}": "Version {n}",
  "Excluir canvas {title}": "Delete canvas {title}",
  "Excluir canvas": "Delete canvas",
  "Nenhum canvas encontrado": "No canvas found",
  "Sua biblioteca está vazia": "Your library is empty",
  "Explorar exemplos": "Browse examples",
  "Carregar mais": "Load more",

  // Markdown
  Imagem: "Image",
  anexo: "attachment",

  // Run activity
  Ferramenta: "Tool",
  Especialista: "Subagent",
  "Resposta entregue": "Reply delivered",
  "Execução concluída sem resposta de texto": "Run finished without a text reply",
  etapa: "step",
  etapas: "steps",
  " registrada": " recorded",
  " registradas": " recorded",
  falha: "failure",
  falhas: "failures",
  "sem confirmação": "unconfirmed",
  "O registro de etapas está incompleto.": "The step record is incomplete.",
  "Etapas registradas": "Recorded steps",
  "Duração da etapa: ": "Step duration: ",
  "Falha na ferramenta": "Tool failed",
  "Atualizações do agente": "Agent updates",
  "Tempo limite atingido": "Timed out",
  "Permissão negada": "Permission denied",
  "Cancelamento informado": "Reported as cancelled",
  "A ferramenta retornou um código de saída diferente de zero":
    "The tool returned a non-zero exit code",
  Terminal: "Terminal",
  "Execução de código": "Code execution",
  "Delegação de tarefa": "Task delegation",
  "Leitura de arquivo": "File read",
  "Gravação de arquivo": "File write",
  "Pesquisa na web": "Web search",
  "Criação de canvas": "Canvas creation",
  "Atualização de canvas": "Canvas update",
  "Leitura de canvas": "Canvas read",
  "Consulta de canvases": "Canvas lookup",
  "Exportação de canvas": "Canvas export",
  "Consulta de blocos": "Block lookup",
  "Medição de recursos do sistema": "System resource measurement",
  "Em andamento": "In progress",
  Concluída: "Done",
  Falhou: "Failed",
  "Sem confirmação": "Unconfirmed",
  "Execução falhou": "Run failed",
  "Execução interrompida": "Run interrupted",
  "Execução cancelada": "Run cancelled",
  "Etapas da execução": "Run steps",
  "Ferramenta iniciada": "Tool started",
  "Ferramenta encerrada": "Tool finished",
  "Especialista iniciado": "Subagent started",
  "Especialista retornou": "Subagent returned",
  "Aprovação solicitada": "Approval requested",
  "Aprovação respondida": "Approval answered",
  "Esclarecimento solicitado": "Clarification requested",
  "Esclarecimento respondido": "Clarification answered",

  // Approvals and questions
  "Solicitação de aprovação": "Approval request",
  "O Hermes solicita aprovação": "Hermes is asking for approval",
  "Comando solicitado": "Requested command",
  "Permitir uma vez": "Allow once",
  Recusar: "Deny",
  "O Hermes precisa de uma resposta": "Hermes needs an answer",
  "Como deseja continuar?": "How would you like to continue?",
  "Escolha uma ou mais opções": "Choose one or more options",
  "Escolha uma opção": "Choose an option",
  "Ou escreva sua resposta": "Or write your answer",
  "Sua resposta": "Your answer",
  "Resposta ao Hermes": "Answer to Hermes",
  "A resposta excede o limite de 12.000 caracteres.":
    "The answer is over the 12,000 character limit.",
  Responder: "Answer",

  // Settings
  sim: "yes",
  não: "no",
  "SEU AMBIENTE": "YOUR ENVIRONMENT",
  "Execuções, ferramentas e decisões continuam sob controle do seu agente.":
    "Runs, tools and decisions stay under your agent's control.",
  "Conversa do Atlas": "Atlas chat",
  "Conexão validada · modelo {model}": "Connection verified · model {model}",
  "Verificando conexão…": "Checking connection…",
  "A conversa desta página usa o servidor de API do Hermes. Canvases, biblioteca e ferramentas do agente funcionam sem ele.":
    "The chat on this page uses the Hermes API server. Canvases, the library and the agent's tools work without it.",
  "Verificar conexão": "Check connection",
  Idioma: "Language",
  "Idioma da interface": "Interface language",
  Automático: "Automatic",
  Aparência: "Appearance",
  Tema: "Theme",
  Sistema: "System",
  Claro: "Light",
  Escuro: "Dark",
  "O Atlas acompanha o tema do Hermes. Troque o tema no próprio Hermes.":
    "Atlas follows the Hermes theme. Change the theme in Hermes itself.",
  "Seus dados": "Your data",
  "Conversas, rascunhos e versões ficam no servidor, separados pelo perfil e pela conexão Hermes. Credenciais permanecem no servidor.":
    "Conversations, drafts and versions live on the server, separated by profile and Hermes connection. Credentials stay on the server.",
  "O texto e os anexos ainda não enviados ficam nesta aba por conversa e perfil.":
    "Text and attachments not sent yet stay in this tab, per conversation and profile.",
  Diagnóstico: "Diagnostics",
  Interface: "Interface",
  Servidor: "Server",
  "Exportação em HTML": "HTML export",
  "Extensão do Desktop vista": "Desktop extension seen",
  "A interface e o servidor são de versões diferentes. Atualize o plugin e recarregue.":
    "The interface and the server are different versions. Update the plugin and reload.",
  "Instalação e documentação": "Installation and documentation",

  // Transport
  "Não foi possível concluir ({status}).": "Could not complete the request ({status}).",
  "A conexão do Desktop mudou. Reabra o Atlas.": "The Desktop connection changed. Reopen Atlas.",
  "Resposta descartada porque a conexão mudou.":
    "Reply discarded because the connection changed.",
  "Abra uma conversa no Hermes antes de enviar.": "Open a conversation in Hermes before sending.",
  "Ative a sessão e o perfil de destino antes de enviar.":
    "Activate the target session and profile before sending.",

  // Inline canvas (inside a Hermes Desktop conversation)
  "Este canvas mudou em outra janela. Mostrando a versão atual.":
    "This canvas changed in another window. Showing the current version.",
  "Versão {n} salva com suas alterações.": "Version {n} saved with your changes.",
  "Não foi possível descartar suas alterações. {detail}": "Could not discard your changes. {detail}",
  "Adicionado à sua mensagem. Revise e envie.": "Added to your message. Review and send.",
  "Copiado. Cole na conversa para enviar ao Hermes.":
    "Copied. Paste it in the conversation to send it to Hermes.",
  "Abra a conversa para enviar: {text}": "Open the conversation to send: {text}",
  "Canvas do Atlas": "Atlas canvas",
  "Preparando o canvas…": "Preparing the canvas…",
  "Carregando o canvas…": "Loading the canvas…",
  "Este canvas não está mais na biblioteca do Atlas.":
    "This canvas is no longer in the Atlas library.",
  "Não foi possível carregar o canvas. {detail}": "Could not load the canvas. {detail}",
  "Tentar novamente": "Try again",
  "Recolher canvas": "Collapse canvas",
  "Expandir canvas": "Expand canvas",
  "Descartar minhas alterações": "Discard my changes",
  "Baixar como página HTML": "Download as an HTML page",
  "Abrir no Atlas": "Open in Atlas",
  "Salvando suas alterações…": "Saving your changes…",
  "Alterações guardadas como rascunho. O Hermes já consegue vê-las.":
    "Changes kept as a draft. Hermes can already see them.",
  "Existe a versão {n}": "Version {n} is available",

  // Exported page
  "Usar tema claro": "Use light theme",
  "Usar tema escuro": "Use dark theme",
  "Exportado do Hermes Atlas {version}": "Exported from Hermes Atlas {version}",
};
