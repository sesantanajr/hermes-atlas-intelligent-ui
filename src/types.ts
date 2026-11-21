export type Input = {label:string;value:number;min:number;max:number;step:number};
type Base = {id:string;title:string};
export type Block = Base & (
  {type:'text';text:string} | {type:'metric';value:string;detail?:string} |
  {type:'chart';unit?:string;points:{label:string;value:number}[]} |
  {type:'table';columns:string[];rows:string[][]} |
  {type:'checklist';items:string[]} |
  {type:'comparison';options:{name:string;description:string;features:string[]}[]} |
  {type:'calculator';operation:'sum'|'product'|'split'|'compound';inputs:Input[];unit?:string}
);
export type Canvas = {schema_version:'1.0';id:string;title:string;description:string;blocks:Block[]};
export type Record = {id:string;revision:number;updated:string;canvas:Canvas};
export type Summary = {id:string;revision:number;title:string;updated:string};
export type Message = {role:'user'|'assistant';content:string;artifactId?:string};
export type Conversation = {id:string;title:string;messages:Message[]};
