const base = '/api/plugins/hermes-atlas';
export async function api<T>(path:string, data?:unknown):Promise<T> {
 const init:RequestInit = data === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)};
 if(window.__HERMES_PLUGIN_SDK__) return window.__HERMES_PLUGIN_SDK__.fetchJSON(base+path,init) as Promise<T>;
 const response=await fetch(base+path,init);
 if(!response.ok){ const body=await response.json().catch(()=>({})); throw new Error(typeof body.detail==='string'?body.detail:`Não foi possível concluir (${response.status}).`); }
 return response.json();
}
export function download(name:string,data:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
