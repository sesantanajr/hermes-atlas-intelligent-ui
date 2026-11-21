import { Canvas } from './types';
export const examples:Canvas[] = [
 {schema_version:'1.0',id:'demo-focus',title:'Seu próximo grande projeto, em perspectiva.',description:'Uma visão interativa para transformar uma ideia em próximos passos. Todos os dados deste exemplo são ilustrativos.',blocks:[
  {id:'m1',type:'metric',title:'Horizonte',value:'4 semanas',detail:'Da descoberta à primeira entrega'},
  {id:'m2',type:'metric',title:'Foco da semana',value:'Descobrir',detail:'Comece pelo problema que importa'},
  {id:'chart',type:'chart',title:'Distribuição do esforço',unit:'h',points:[{label:'Descoberta',value:16},{label:'Design',value:24},{label:'Construção',value:40},{label:'Validação',value:20}]},
  {id:'steps',type:'checklist',title:'Pequenos passos. Progresso real.',items:['Definir o problema e quem o enfrenta','Conversar com três pessoas','Desenhar a primeira experiência','Testar antes de expandir']}
 ]},
 {schema_version:'1.0',id:'demo-savings',title:'Explore o efeito do tempo.',description:'Simulação matemática ilustrativa, com taxa constante e sem impostos, inflação ou aportes adicionais.',blocks:[
  {id:'calculator',type:'calculator',title:'Laboratório de juros compostos',operation:'compound',unit:'R$',inputs:[{label:'Valor inicial',value:10000,min:0,max:100000,step:500},{label:'Taxa anual (%)',value:8,min:0,max:20,step:0.5},{label:'Tempo (anos)',value:10,min:1,max:40,step:1}]},
  {id:'explain',type:'text',title:'A matemática por trás',text:'Valor final = valor inicial × (1 + taxa anual / 100) ^ anos. Ajuste os controles e observe como cada variável afeta o resultado. Esta ferramenta explica a fórmula; não prevê retornos.'}
 ]},
 {schema_version:'1.0',id:'demo-compare',title:'Uma decisão com mais clareza.',description:'Compare duas abordagens para um projeto fictício. Selecione uma opção para destacar seu foco.',blocks:[
  {id:'compare',type:'comparison',title:'Como você quer começar?',options:[{name:'Experimento enxuto',description:'Aprender cedo, com uma primeira entrega pequena.',features:['Uma hipótese por vez','Menor investimento inicial','Feedback em poucos dias']},{name:'Plataforma completa',description:'Construir uma base para várias equipes.',features:['Escopo definido em conjunto','Mais planejamento inicial','Integrações desde o início']}]},
  {id:'table',type:'table',title:'Critérios para conversar com sua equipe',columns:['Critério','Experimento','Plataforma'],rows:[['Tempo inicial','Dias','Semanas'],['Incerteza aceita','Alta','Menor'],['Foco','Aprendizado','Consistência']]}
 ]}
];
