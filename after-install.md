# Atlas Intelligent UI 1.1

Canvases interativos (gráficos, tabelas, formulários, checklists, mapas, orçamentos) nas
respostas do Hermes. / Interactive canvases in Hermes replies.

1. Ligue o plugin, se ainda não ligou / Enable it if you have not yet:
   `hermes plugins enable atlas-intelligent-ui`
2. Hermes Desktop ou Webapp: em **Capacidades → Plugins**, ligue as chaves **Agente** e
   **Desktop** do Atlas Intelligent UI. / In **Capabilities → Plugins**, turn on both switches.
3. Dashboard web: recarregue a página para ver a aba **Atlas**. / Reload to see the **Atlas** tab.
4. Confira / Check: `hermes atlas doctor`

Tinha a 1.0 (`hermes-atlas`)? / Had 1.0 (`hermes-atlas`)? `hermes plugins remove hermes-atlas`,
depois / then `hermes atlas migrate`: seus canvases vêm junto / your canvases come along.

Experimente / Try: “Monte um orçamento de viagem para Lisboa que eu possa ajustar.”

Opções / Settings: `hermes plugins config atlas-intelligent-ui` ·
Documentação / Docs: https://github.com/sesantanajr/hermes-atlas-intelligent-ui
