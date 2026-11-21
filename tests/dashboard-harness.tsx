// Development-only harness: exercises the built IIFE with a host React instance.
import React from 'react';
import {createRoot} from 'react-dom/client';
(window as any).__HERMES_PLUGIN_SDK__={React,fetchJSON:async(url:string,init?:RequestInit)=>{const res=await fetch(url,init);if(!res.ok)throw new Error('Harness request failed');return res.json();}};
(window as any).__HERMES_PLUGINS__={register:(name:string,Component:React.ComponentType)=>{if(name!=='hermes-atlas')throw new Error('Wrong plugin name');createRoot(document.getElementById('root')!).render(<Component/>);}};
const script=document.createElement('script');script.src='/dashboard/dist/index.js';document.body.appendChild(script);
