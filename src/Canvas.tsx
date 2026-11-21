import React, { useState } from 'react';
import { Check, SlidersHorizontal, Search } from 'lucide-react';
import { Block, Canvas as CanvasData } from './types';

export function calculate(operation:string,values:number[]):number|null {
 let result:number;
 switch(operation){
  case 'sum':result=values.reduce((a,b)=>a+b,0);break;
  case 'product':result=values.reduce((a,b)=>a*b,1);break;
  case 'split':if(values[1]===0)return null; result=values[0]/values[1];break;
  case 'compound':result=values[0]*Math.pow(1+values[1]/100,values[2]);break;
  default:return null;
 }
 return Number.isFinite(result)?result:null;
}
const number=(value:number)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(value);

function Component({block}:{block:Block}){
 const [checked,setChecked]=useState<number[]>([]);
 const [selected,setSelected]=useState<number|null>(null);
 const [query,setQuery]=useState('');
 const [values,setValues]=useState(block.type==='calculator'?block.inputs.map(x=>x.value):[]);
 const [sort,setSort]=useState<{column:number;reverse:boolean}|null>(null);
 if(block.type==='metric')return <section className="atlas-block metric"><p>{block.title}</p><strong>{block.value}</strong><span>{block.detail}</span></section>;
 return <section className={`atlas-block ${block.type}`}><h3>{block.title}</h3>
  {block.type==='text'&&<p className="prose">{block.text}</p>}
  {block.type==='chart'&&<div className="bars" role="img" aria-label={block.points.map(p=>`${p.label}: ${p.value} ${block.unit||''}`).join('; ')}>{block.points.map((p,i)=><div className="bar-row" key={i}><span>{p.label}</span><div className="bar-track"><div style={{width:`${Math.abs(p.value)/Math.max(1,...block.points.map(x=>Math.abs(x.value)))*100}%`}}/></div><b>{number(p.value)} {block.unit}</b></div>)}</div>}
  {block.type==='checklist'&&<div className="checks">{block.items.map((text,i)=><label key={i} className={checked.includes(i)?'done':''}><input type="checkbox" checked={checked.includes(i)} onChange={()=>setChecked(checked.includes(i)?checked.filter(x=>x!==i):[...checked,i])}/><span>{text}</span></label>)}<small>{checked.length} de {block.items.length} concluídos · seleção temporária</small></div>}
  {block.type==='comparison'&&<div className="comparison-grid">{block.options.map((option,i)=><button key={i} className={selected===i?'selected':''} aria-pressed={selected===i} onClick={()=>setSelected(i)}><strong>{option.name}</strong><p>{option.description}</p>{option.features.map((f,j)=><span key={j}><Check size={15}/>{f}</span>)}</button>)}</div>}
  {block.type==='table'&&<><label className="table-search"><Search size={16}/><input aria-label="Filtrar tabela" placeholder="Filtrar linhas..." value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="table-scroll"><table><thead><tr>{block.columns.map((c,i)=><th key={i} aria-sort={sort?.column===i?(sort.reverse?'descending':'ascending'):'none'}><button onClick={()=>setSort({column:i,reverse:sort?.column===i?!sort.reverse:false})}>{c} {sort?.column===i?(sort.reverse?'↓':'↑'):''}</button></th>)}</tr></thead><tbody>{block.rows.filter(r=>r.some(c=>c.toLowerCase().includes(query.toLowerCase()))).sort((a,b)=>sort?(sort.reverse?-1:1)*a[sort.column].localeCompare(b[sort.column],'pt-BR',{numeric:true}):0).map((row,i)=><tr key={i}>{row.map((c,j)=><td key={j}>{c}</td>)}</tr>)}</tbody></table></div></>}
  {block.type==='calculator'&&<div className="calculator-body"><div>{block.inputs.map((input,i)=><label className="slider" key={i}><span>{input.label}<b>{number(values[i])}</b></span><input aria-label={input.label} type="range" min={input.min} max={input.max} step={input.step} value={values[i]} onChange={e=>setValues(values.map((v,j)=>i===j?Number(e.target.value):v))}/><small>{number(input.min)}<span>{number(input.max)}</span></small></label>)}</div><div className="calc-result"><SlidersHorizontal size={22}/><span>Resultado da simulação</span><strong>{calculate(block.operation,values)===null?'Indefinido':`${block.unit||''} ${number(calculate(block.operation,values)!)}`}</strong><small>Atualizado com os valores selecionados</small></div></div>}
 </section>;
}
export function Canvas({canvas}:{canvas:CanvasData}){return <div className="canvas-grid">{canvas.blocks.map(block=><Component key={`${canvas.id}-${block.id}-${JSON.stringify(block)}`} block={block}/>)}</div>;}
