import {createFileRoute} from '@tanstack/react-router';
import {useEffect,useState} from 'react';
import {api,describeFailure,localMailCapture,type CapturedMail} from '@/lib/api';
import {AuthShell,Notice} from '@/components/account/ui';

export const Route=createFileRoute('/dev/inbox')({ssr:false,component:Inbox,head:()=>({meta:[{title:'Local email inbox'},{name:'robots',content:'noindex'}]})});
function Inbox(){
  const [messages,setMessages]=useState<CapturedMail[]>([]);const [error,setError]=useState<string>();
  useEffect(()=>{
    if(!localMailCapture)return;
    let active=true;
    const load=async()=>{
      const result=await api.capturedMail();if(!active)return;
      if(result.ok){setMessages(result.data.messages);setError(undefined);}else setError(describeFailure(result.error));
    };
    void load();const timer=setInterval(()=>void load(),1500);return()=>{active=false;clearInterval(timer);};
  },[]);
  if(!localMailCapture)return <AuthShell title="Page unavailable"><p>This inbox is available only for local email testing.</p></AuthShell>;
  return <AuthShell title="Development email inbox"><Notice tone="info">Local testing only. These emails have not been sent to real inboxes.</Notice>{error&&<div className="mt-4"><Notice tone="error">{error}</Notice></div>}<ul className="mt-5 space-y-4">{messages.map(mail=><li key={mail.id} className="rounded-xl border p-4"><p className="break-all">{mail.to}</p>{mail.subject&&<p className="mt-3 font-semibold">{mail.subject}</p>}{mail.text&&<p className="my-3 whitespace-pre-wrap break-words text-sm">{mail.text}</p>}{mail.notification_url&&<a className="link" href={new URL(mail.notification_url).pathname+new URL(mail.notification_url).hash}>Open service update</a>}{mail.availability_verification_url?<a className="link" href={'/availability/verify'+new URL(mail.availability_verification_url).hash}>Open availability verification link</a>:mail.reset_url?<a className="link" href={'/auth/reset-password'+new URL(mail.reset_url).hash}>Open password reset link</a>:mail.verification_url?<a className="link" href={'/auth/verify'+new URL(mail.verification_url).hash}>Open verification link</a>:null}{mail.availability_unsubscribe_url&&<a className="link mt-3 block" href={'/availability/unsubscribe'+new URL(mail.availability_unsubscribe_url).hash}>Unsubscribe availability alert</a>}</li>)}</ul>{!messages.length&&<p className="mt-5" role="status">Waiting for captured email…</p>}</AuthShell>;
}
