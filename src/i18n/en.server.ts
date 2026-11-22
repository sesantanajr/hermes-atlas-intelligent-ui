/**
 * English for the messages the Atlas server writes: error details and run warnings. The server
 * (hermes_atlas/server, hermes_atlas/storage, hermes_atlas/chat) speaks Portuguese, and the
 * interface translates what it shows with `serverText()`.
 *
 * `tests/test_server_messages.py` reads this file and fails when the server gains a message that
 * has no entry here.
 */
export const enServer: Record<string, string> = {
  // Workspace and library
  "O perfil ou a conexão mudou. Recarregue o Atlas antes de continuar.":
    "The profile or the connection changed. Reload Atlas before continuing.",
  "Tipo de bloco desconhecido.": "Unknown block type.",
  "Canvas não encontrado.": "Canvas not found.",
  "O canvas excede o limite de 256 KB.": "The canvas is over the 256 KB limit.",
  "Versão do canvas não encontrada.": "Canvas version not found.",
  "O rascunho pertence a outro canvas.": "The draft belongs to another canvas.",
  "O rascunho foi alterado em outra aba.": "The draft was changed in another tab.",
  "Este canvas mudou em outra janela. Abra a última versão antes de salvar.":
    "This canvas changed in another window. Open the latest version before saving.",
  "A exportação em HTML não está disponível nesta instalação.":
    "HTML export is not available in this installation.",

  // Conversations and runs
  "Conversa não encontrada.": "Conversation not found.",
  "Interrompa e aguarde a execução terminar antes de excluir a conversa.":
    "Stop the run and wait for it to end before deleting the conversation.",
  "Esta conversa ou execução já foi excluída.": "This conversation or run was already deleted.",
  "Esta conversa já possui uma execução em andamento.":
    "This conversation already has a run in progress.",
  "A chave desta execução já pertence a outro pedido.":
    "This run's key already belongs to another request.",
  "Versão de contexto não encontrada.": "Context version not found.",
  "Mensagem, arquivos e canvas excedem 450 KB. Reduza os anexos.":
    "Message, files and canvas are over 450 KB. Reduce the attachments.",
  "Execução não encontrada neste perfil.": "Run not found in this profile.",
  "Aguarde a confirmação de admissão do gateway.":
    "Wait for the gateway to confirm it accepted the run.",
  "Escolha e identificação da aprovação são obrigatórias.":
    "The choice and the approval id are required.",
  "A resposta e a identificação da pergunta são obrigatórias.":
    "The answer and the question id are required.",
  "Identidade e geração são obrigatórias para reconhecer uma execução interrompida.":
    "Identity and generation are required to acknowledge an interrupted run.",
  "O chat foi migrado para /runs. Recarregue a interface do Atlas.":
    "Chat moved to /runs. Reload the Atlas interface.",
  "Admissão sem confirmação encerrada localmente por você. O estado remoto continua desconhecido.":
    "You closed an unconfirmed submission locally. The remote state is still unknown.",
  "A admissão ficou sem confirmação e a janela segura de repetição expirou. Verifique a sessão no Hermes antes de continuar.":
    "The submission was never confirmed and the safe retry window expired. Check the session in Hermes before continuing.",
  "O gateway não retornou uma identidade de execução válida.":
    "The gateway did not return a valid run id.",
  "Estado de execução incompatível.": "Incompatible run state.",
  "O Hermes confirmou a conclusão sem fornecer a resposta final. O texto exibido é uma prévia recuperada.":
    "Hermes confirmed completion without providing the final reply. The text shown is a recovered preview.",
  "Falha ao acompanhar a execução. Reabra a conversa para consultar o estado no Hermes.":
    "Could not follow the run. Reopen the conversation to check its state in Hermes.",
  "O Hermes terminou sem texto nem canvas.": "Hermes finished with neither text nor a canvas.",
  "O canvas recebido é inválido. O conteúdo original foi preservado.":
    "The canvas received is invalid. The original content was kept.",
  "O Hermes não concluiu a execução.": "Hermes did not complete the run.",
  "Execução interrompida.": "Run interrupted.",
  "O gateway foi interrompido.": "The gateway was interrupted.",

  // Connection to the Hermes API server
  "Atualize o Hermes: o Atlas requer Runs com idempotência persistente.":
    "Update Hermes: Atlas needs Runs with persistent idempotency.",
  "Esta versão do Hermes não oferece o contrato de execução exigido pelo Atlas.":
    "This Hermes version does not offer the run contract Atlas requires.",
  "ATLAS_HERMES_URL inválida.": "Invalid ATLAS_HERMES_URL.",
  "Use HTTPS ou um túnel local para o Hermes remoto.":
    "Use HTTPS or a local tunnel for a remote Hermes.",
  "Resposta do Hermes excedeu 2 MB.": "The Hermes response was over 2 MB.",
  "O gateway demorou para responder; a execução pode continuar no Hermes.":
    "The gateway took too long to answer; the run may still be going in Hermes.",
  "Resposta indisponível ou incompatível do gateway Hermes.":
    "The Hermes gateway's response was unavailable or incompatible.",
  "O Hermes não respondeu à verificação de conexão.":
    "Hermes did not answer the connection check.",
  "O endereço respondeu, mas não apresentou o contrato de capacidades do Hermes.":
    "The address answered, but did not present the Hermes capabilities contract.",
};

/** Messages with a variable part: `[pattern, replacement]`, tried after the exact table. */
export const enServerPatterns: [RegExp, string][] = [
  [/^Hermes recusou a operação \(HTTP (\d+)\)\.$/, "Hermes refused the operation (HTTP $1)."],
];
