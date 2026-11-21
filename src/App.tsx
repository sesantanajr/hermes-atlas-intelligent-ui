import React, { useEffect, useRef, useState } from 'react';
import { Aperture, Plus, Search, LayoutGrid, MessageSquare, Settings2, Sparkles, PanelLeftClose, PanelLeftOpen, Download, ChevronRight, ArrowUp, X, Check, Layers, Compass, Activity, ExternalLink, Copy } from 'lucide-react';
import { Canvas } from './Canvas';
import { examples } from './examples';
import { api, download } from './client';
import { Canvas as CanvasData, Conversation, Record as CanvasRecord, Summary } from './types';
import './style.css';
import './readability.css';

function readChats():Conversation[]{try{const data=JSON.parse(localStorage.getItem('atlas:chats')||'[]');return Array.isArray(data)?data.filter(c=>typeof c.id==='string'&&typeof c.title==='string'&&Array.isArray(c.messages)&&c.messages.every((m: {role:string;content:string})=>['user','assistant'].includes(m.role)&&typeof m.content==='string')).slice(0,40):[];}catch{return [];}}
function Logo(){return <div className="brand"><span className="brand-mark"><Aperture size={27}/></span><div>hermes <b>atlas</b><small>INTELLIGENT UI</small></div></div>;}

export function App(){
 const [view,setView]=useState<'home'|'chat'|'library'|'settings'>('home');
 const [sidebar,setSidebar]=useState(()=>window.innerWidth>800);
 const [connected,setConnected]=useState(false);
 const [chats,setChats]=useState<Conversation[]>(readChats);
 const [chatId,setChatId]=useState<string|null>(null);
 const [draft,setDraft]=useState('');
 const [busy,setBusy]=useState(false);
 const inFlight=useRef(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [canvas,setCanvas]=useState<CanvasData|null>(null);
 const [revision,setRevision]=useState(0);
 const [demo,setDemo]=useState(false);
 const [records,setRecords]=useState<Summary[]>([]);
 const [query,setQuery]=useState('');
 const [tab,setTab]=useState<'preview'|'json'>('preview');
 const end=useRef<HTMLDivElement>(null);
 const current=chats.find(c=>c.id===chatId);
 useEffect(()=>{if(window.innerWidth<=800)setSidebar(false);},[view]);
 const refresh=async()=>{try{const status=await api<{connected:boolean}>('/status');setConnected(status.connected);setRecords(await api<Summary[]>('/canvases'));}catch{setConnected(false);}};
 useEffect(()=>{void refresh();const id=setInterval(()=>{if(!document.hidden)void refresh();},30000);return()=>clearInterval(id);},[]);
 useEffect(()=>{try{localStorage.setItem('atlas:chats',JSON.stringify(chats.slice(0,40)));}catch{setNotice('O navegador não conseguiu salvar o histórico. Exporte a conversa antes de sair.');}},[chats]);
 useEffect(()=>{end.current?.scrollIntoView({behavior:'smooth',block:'end'});},[current?.messages.length,busy]);
 const newChat=()=>{if(busy)return;setChatId(null);setCanvas(null);setView('home');setError('');setDraft('');};
 const openExample=(index:number)=>{setCanvas(structuredClone(examples[index]));setRevision(0);setDemo(true);setTab('preview');setView('home');setError('');};
 const openSaved=async(id:string,rev?:number)=>{try{const record=await api<CanvasRecord>(`/canvases/${encodeURIComponent(id)}${rev?`?revision=${rev}`:''}`);setCanvas(record.canvas);setRevision(record.revision);setDemo(false);setTab('preview');setError('');}catch(e){setError((e as Error).message);}};
 const send=async()=>{
  if(!draft.trim()||inFlight.current)return;
  if(!connected){setView('settings');setError('Conecte a API do Hermes para enviar mensagens. Os exemplos estão disponíveis sem conexão.');return;}
  inFlight.current=true;setBusy(true);setError('');setNotice('');
  const id=chatId||crypto.randomUUID();
  const userText=draft.trim();
  const messages=[...(current?.messages||[]),{role:'user' as const,content:userText}];
  const next={id,title:current?.title||userText.slice(0,55),messages};
  setChats(old=>[next,...old.filter(c=>c.id!==id)]);setChatId(id);setDraft('');setView('chat');
  try{
   const result=await api<{text:string;artifact:CanvasRecord|null;warning:string|null}>('/chat',{messages:messages.map(({role,content})=>({role,content}))});
   // Preserve the generated canvas in subsequent model context so follow-up edits remain grounded.
   const responseText=(result.text||'Canvas criado.')+(result.artifact?`\n\n\`\`\`atlas\n${JSON.stringify(result.artifact.canvas)}\n\`\`\``:'');
   setChats(old=>old.map(c=>c.id===id?{...c,messages:[...c.messages,{role:'assistant',content:responseText,artifactId:result.artifact?.id}]}:c));
   if(result.artifact){setCanvas(result.artifact.canvas);setRevision(result.artifact.revision);setDemo(false);setTab('preview');}
   if(result.warning)setNotice(result.warning);
   await refresh();
  }catch(e){setError((e as Error).message);setChats(old=>old.map(c=>c.id===id?{...c,messages:c.messages.slice(0,-1)}:c));setDraft(userText);}
  finally{setBusy(false);inFlight.current=false;}
 };
 const save=async()=>{if(!canvas)return;try{const record=await api<CanvasRecord>('/canvases',canvas);setRevision(record.revision);setDemo(false);setNotice('Canvas salvo na biblioteca.');await refresh();}catch(e){setError((e as Error).message);}};
 const copy=async()=>{try{await navigator.clipboard.writeText(JSON.stringify(canvas,null,2));setNotice('JSON copiado.');}catch{setError('Não foi possível copiar. Use Exportar JSON.');}};

 return <div className={`atlas-app ${sidebar?'':'sidebar-hidden'}`}>
  <aside className="atlas-sidebar"><Logo/><button className="new-chat" onClick={newChat} disabled={busy}><Plus size={18}/> Nova conversa <kbd>＋</kbd></button>
   <nav aria-label="Navegação principal"><button className={view==='home'?'active':''} onClick={()=>setView('home')}><Compass size={18}/> Descobrir</button><button className={view==='library'?'active':''} onClick={()=>{setView('library');setCanvas(null);}}><LayoutGrid size={18}/> Minha biblioteca <span>{records.length}</span></button></nav>
   <div className="sidebar-label">CONVERSAS RECENTES</div><label className="search-chats"><Search size={15}/><input aria-label="Buscar conversas" placeholder="Buscar conversas" value={query} onChange={e=>setQuery(e.target.value)}/></label>
   <div className="recent-chats">{chats.filter(c=>c.title.toLowerCase().includes(query.toLowerCase())).map(c=><button disabled={busy} key={c.id} className={chatId===c.id&&view==='chat'?'active':''} onClick={()=>{setChatId(c.id);setCanvas(null);setView('chat');}}><MessageSquare size={16}/><span>{c.title}</span></button>)}{chats.length===0&&<p>Suas ideias começam aqui.<br/>As conversas ficam neste navegador.</p>}</div>
   <div className="sidebar-bottom"><div className="local-card"><Layers size={19}/><div>Seu espaço, seu Hermes<small>Artefatos no seu ambiente</small></div></div><button className={view==='settings'?'active':''} onClick={()=>setView('settings')}><Settings2 size={18}/> Configurações</button><div className="profile"><span>HA</span><div>Workspace pessoal<small>Atlas · versão 0.1.0</small></div></div></div>
  </aside>
  <main className="atlas-main"><header className="topbar"><div><button className="icon-button" title="Alternar menu" aria-label="Alternar menu" onClick={()=>setSidebar(!sidebar)}>{sidebar?<PanelLeftClose size={19}/>:<PanelLeftOpen size={19}/>}</button><span>Workspace</span><ChevronRight size={14}/><b>{view==='library'?'Biblioteca':view==='settings'?'Configurações':view==='chat'?'Conversa':'Descobrir'}</b></div><button className="connection" onClick={()=>setView('settings')}><i className={connected?'online':''}/>{connected?'Hermes conectado':'Hermes desconectado'}<ChevronRight size={13}/></button></header>
   {error&&<div className="alert error" role="alert">{error}<button aria-label="Fechar erro" onClick={()=>setError('')}><X size={16}/></button></div>}
   {notice&&<div className="alert" role="status">{notice}<button aria-label="Fechar aviso" onClick={()=>setNotice('')}><X size={16}/></button></div>}
   <div className={`workspace ${canvas?'with-canvas':''}`}><div className="conversation-pane">
    {view==='home'&&<div className="welcome"><div className="eyebrow"><Sparkles size={14}/> UM NOVO JEITO DE PENSAR COM IA</div><h1>Mais que respostas.<br/><span>Ideias com as quais interagir.</span></h1><p>Converse com o Hermes. Explore dados, compare caminhos<br className="desktop-break"/> e transforme perguntas em experiências.</p>
     <div className="suggestions">{[{icon:'◈',title:'Entender melhor',text:'Explique um tema com uma interface interativa.'},{icon:'◷',title:'Explorar possibilidades',text:'Crie uma calculadora para dividir uma conta.'},{icon:'▤',title:'Decidir com clareza',text:'Ajude-me a comparar duas opções de projeto.'}].map(s=><button key={s.title} onClick={()=>{setDraft(s.text);document.getElementById('atlas-prompt')?.focus();}}><span>{s.icon}</span><b>{s.title}</b><small>{s.text}</small></button>)}</div>
     <div className="section-heading"><div><h2>Um pouco do que é possível</h2><p>Abra um exemplo e experimente.</p></div><span>GALERIA INTERATIVA</span></div>
     <div className="example-grid">{examples.map((example,i)=><button className={`example example-${i}`} key={example.id} onClick={()=>openExample(i)}><div className="example-art" aria-hidden="true">{i===0?<><div className="mini-bars">{[40,64,90,56,76,44,68].map((h,j)=><i style={{height:h}} key={j}/>)}</div><span className="art-pill">Do plano à ação</span></>:i===1?<><svg viewBox="0 0 260 110"><path d="M0 100 Q70 100 110 65 T260 0" fill="none" stroke="currentColor" strokeWidth="3"/><path d="M0 100 Q70 100 110 65 T260 0 V110 H0Z" fill="currentColor" opacity=".08"/></svg><span className="art-pill">E se você mudar uma variável?</span></>:<div className="mini-compare"><div><i/><i/><i/></div><div><i/><i/><i/></div></div>}</div><div className="example-caption"><span>{['Planejamento visual','Simulação ao vivo','Comparação interativa'][i]}</span><ChevronRight size={17}/></div><small>Exemplo ilustrativo</small></button>)}</div>
    </div>}
    {view==='chat'&&<div className="messages"><div className="chat-heading"><span><MessageSquare size={16}/> {current?.title||'Nova conversa'}</span>{current&&<button className="icon-button" title="Exportar conversa" aria-label="Exportar conversa" onClick={()=>download('atlas-conversa.json',current)}><Download size={17}/></button>}</div>{current?.messages.map((m,i)=><article key={i} className={`message ${m.role}`}><span className="avatar">{m.role==='user'?'Você':<Aperture size={18}/>}</span><div><strong>{m.role==='user'?'Você':'Hermes Atlas'}</strong><p>{m.role==='assistant'&&m.artifactId?m.content.replace(/```atlas\s*\n[\s\S]*?```/g,'').trim():m.content}</p>{m.role==='assistant'&&m.artifactId&&<button className="inline-action" onClick={()=>{try{const match=m.content.match(/```atlas\s*\n([\s\S]*?)```/);if(match){const saved=JSON.parse(match[1]);void openSaved(saved.id);}}catch{setError('Não foi possível abrir este canvas.');}}}><LayoutGrid size={16}/> Abrir canvas salvo</button>}</div></article>)}{busy&&<div className="thinking" role="status"><Aperture size={18}/><span>Hermes está trabalhando na sua ideia…</span><i/></div>}<div ref={end}/></div>}
    {view==='library'&&<div className="library"><div className="eyebrow"><Layers size={14}/> SEU REPERTÓRIO VISUAL</div><h1>Minha biblioteca</h1><p>Canvases salvos no perfil ativo. Cada atualização preserva uma nova versão.</p>{records.length===0?<div className="empty"><LayoutGrid size={38}/><h2>Espaço para suas próximas ideias.</h2><p>Crie um canvas com o Hermes ou salve um exemplo da galeria.</p><button className="primary" onClick={()=>setView('home')}>Explorar exemplos</button></div>:<div className="saved-grid">{records.map(r=><button key={r.id} onClick={()=>void openSaved(r.id)}><LayoutGrid size={24}/><h3>{r.title}</h3><p>Versão {r.revision} · {new Date(r.updated).toLocaleDateString('pt-BR')}</p><span>Abrir canvas <ChevronRight size={16}/></span></button>)}</div>}</div>}
    {view==='settings'&&<div className="settings"><div className="eyebrow"><Settings2 size={14}/> SEU AMBIENTE</div><h1>Conectado ao seu Hermes.</h1><p>O Atlas usa o modelo, as ferramentas e as políticas configuradas no seu agente.</p><section className="setting-card"><h2><Activity size={19}/> Conexão com o gateway</h2><p>{connected?'A API do Hermes respondeu à verificação.':'O gateway não está acessível ou a chave ainda não foi configurada.'}</p><ol><li>No ambiente do Hermes, habilite <code>API_SERVER_ENABLED=true</code> e defina <code>API_SERVER_KEY</code>.</li><li>No processo do Atlas, configure <code>ATLAS_HERMES_URL</code> (padrão: <code>http://127.0.0.1:8642/v1</code>) e <code>ATLAS_HERMES_API_KEY</code> com a mesma chave.</li><li>Inicie <code>hermes gateway</code> e reinicie o Atlas.</li></ol><button className="primary" onClick={()=>void refresh()}>Verificar conexão</button></section><section className="setting-card"><h2><Layers size={19}/> Dados e privacidade</h2><p>Conversas são armazenadas neste navegador. Canvases e versões ficam no SQLite do perfil Hermes. Credenciais são lidas pelo servidor, nunca pelo navegador.</p><p>Este aplicativo local destina-se a um único usuário. Para acesso em rede, use a extensão dentro do dashboard autenticado do Hermes.</p><button onClick={()=>download('atlas-historico.json',chats)}><Download size={16}/> Exportar histórico</button></section><a href="https://github.com/sesantanajr/hermes-atlas-intelligent-ui" target="_blank" rel="noreferrer">Código, instalação e documentação <ExternalLink size={15}/></a></div>}
    {(view==='home'||view==='chat')&&<div className="composer-wrap"><form className="composer" onSubmit={e=>{e.preventDefault();void send();}}><textarea id="atlas-prompt" aria-label="Mensagem para o Hermes" placeholder="O que vamos explorar hoje?" maxLength={12000} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/><div><span><Sparkles size={15}/> Interface inteligente <small>· Automática</small></span><button type="submit" aria-label="Enviar mensagem" disabled={!draft.trim()||busy}><ArrowUp size={20}/></button></div></form><p>Seu agente. Suas ferramentas. Novas possibilidades. <span>Enter para enviar</span></p></div>}
   </div>
   {canvas&&<aside className="canvas-pane"><div className="canvas-toolbar"><span><LayoutGrid size={16}/> Canvas <small>{demo?'Demonstração':`v${revision}`}</small></span><div><button className="icon-button" title="Exportar JSON" aria-label="Exportar JSON" onClick={()=>download(`${canvas.id}.json`,canvas)}><Download size={17}/></button><button className="icon-button" title="Fechar canvas" aria-label="Fechar canvas" onClick={()=>setCanvas(null)}><X size={18}/></button></div></div><div className="canvas-content"><div className="canvas-eyebrow">{demo?'EXEMPLO ILUSTRATIVO':'CANVAS SALVO'}</div><h2>{canvas.title}</h2><p>{canvas.description}</p><div className="canvas-tabs"><div role="tablist" aria-label="Visualização do canvas"><button role="tab" aria-selected={tab==='preview'} onClick={()=>setTab('preview')}>Interagir</button><button role="tab" aria-selected={tab==='json'} onClick={()=>setTab('json')}>JSON</button></div><div>{revision>1&&<button onClick={()=>void openSaved(canvas.id,revision-1)}>Versão anterior</button>}<button onClick={()=>void save()}><Check size={14}/>{demo?'Salvar exemplo':'Salvar versão'}</button></div></div>{tab==='preview'?<Canvas key={`${canvas.id}-${revision}`} canvas={canvas}/>:<div className="json-view"><button onClick={()=>void copy()}><Copy size={15}/> Copiar</button><pre>{JSON.stringify(canvas,null,2)}</pre></div>}<div className="canvas-footer"><Layers size={13}/> Atlas UI Protocol 1.0 · Componentes validados</div></div></aside>}
   </div>
  </main>
 </div>;
}
