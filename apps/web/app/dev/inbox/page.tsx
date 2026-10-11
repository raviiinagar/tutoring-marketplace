'use client';
import {useEffect,useState} from 'react';
interface Mail{ id:string;to:string;verification_url:string }
export default function Inbox(){
  const [messages,setMessages]=useState<Mail[]>([]);const [error,setError]=useState('');
  useEffect(()=>{if(process.env.NODE_ENV!=='development')return;const load=()=>fetch('/dev/mail').then(async r=>{if(!r.ok)throw new Error();setMessages((await r.json()).messages);}).catch(()=>setError('Development mail capture is unavailable.'));load();const timer=setInterval(load,1500);return()=>clearInterval(timer);},[]);
  if(process.env.NODE_ENV!=='development')return <section><h1>Not available</h1></section>;
  return <section><h1>Development email inbox</h1><p className="notice">Local testing only. These emails have not been sent to real inboxes.</p>{error&&<p role="alert">{error}</p>}<ul>{messages.map(mail=><li key={mail.id}>{mail.to}<br/><a href={mail.verification_url}>Open verification link</a></li>)}</ul>{!messages.length&&<p>Waiting for captured email…</p>}</section>;
}
