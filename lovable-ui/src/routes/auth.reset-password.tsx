import {createFileRoute,Link} from '@tanstack/react-router';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {api,describeFailure} from '@/lib/api';
import {TOKEN_RE,validateNewPassword} from '@/lib/validation';
import {AuthShell,Field,Notice,SubmitButton,useSingleFlight} from '@/components/account/ui';

export const Route=createFileRoute('/auth/reset-password')({ssr:false,component:Reset,head:()=>({meta:[{title:'Choose a new password — Tutor Marketplace'},{name:'robots',content:'noindex'}]})});
function Reset(){
  const token=useRef<string|null>(null);const [ready,setReady]=useState(false);const [password,setPassword]=useState('');const [error,setError]=useState<string>();const [done,setDone]=useState(false);const {loading,run}=useSingleFlight();
  useEffect(()=>{const found=new URLSearchParams(window.location.hash.slice(1)).get('token');if(found!==null){token.current=found;window.history.replaceState(window.history.state,'',window.location.pathname);}setReady(TOKEN_RE.test(token.current||''));},[]);
  const submit=(event:FormEvent)=>{event.preventDefault();void run(async()=>{
    setError(undefined);const invalid=validateNewPassword(password);if(invalid){setError(invalid);return;}
    if(!token.current)return;const result=await api.resetPassword(token.current,password);
    if(result.ok){token.current=null;setPassword('');setDone(true);}else{setError(describeFailure(result.error));if(result.error.kind==='http'&&result.error.code==='INVALID_OR_EXPIRED_TOKEN'){token.current=null;setReady(false);}}
  });};
  return <AuthShell title={done?'Password updated':'Choose a new password'}>
    {done?<><Notice tone="success">All sessions have been signed out. Sign in with your new password.</Notice><Link to="/auth/signin" className="btn-primary mt-5 w-full">Sign in</Link></>:ready?<form onSubmit={submit} noValidate className="space-y-5">{error&&<Notice tone="error">{error}</Notice>}<Field label="New password" type="password" autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)}/><p className="text-sm">Use 12–128 characters. Resetting signs out every device.</p><SubmitButton loading={loading} loadingText="Updating password…">Update password</SubmitButton></form>:<><Notice tone="error">{error||'Open a valid password reset link from your email.'}</Notice><Link to="/auth/forgot-password" className="link mt-5 inline-block">Request a new reset link</Link></>}
  </AuthShell>;
}
