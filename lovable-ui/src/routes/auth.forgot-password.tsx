import {createFileRoute,Link} from '@tanstack/react-router';
import {useState,type FormEvent} from 'react';
import {api,describeFailure,localMailCapture} from '@/lib/api';
import {validateEmail} from '@/lib/validation';
import {AuthShell,Field,Notice,SubmitButton,useSingleFlight} from '@/components/account/ui';

export const Route=createFileRoute('/auth/forgot-password')({component:Recovery,head:()=>({meta:[{title:'Reset password — Tutor Marketplace'},{name:'robots',content:'noindex'}]})});
function Recovery(){
  const [email,setEmail]=useState('');const [error,setError]=useState<string>();const [sent,setSent]=useState(false);const {loading,run}=useSingleFlight();
  const submit=(event:FormEvent)=>{event.preventDefault();void run(async()=>{
    setError(undefined);const invalid=validateEmail(email);if(invalid){setError(invalid);return;}
    const result=await api.recoveryEmail(email.trim());if(result.ok)setSent(true);else setError(describeFailure(result.error));
  });};
  return <AuthShell title="Reset your password" footer={<Link to="/auth/signin" className="link">Back to sign in</Link>}>
    {sent ? <Notice tone="success">If this email belongs to an eligible account, a password reset link will arrive shortly. The link expires in 15 minutes.</Notice> : <form onSubmit={submit} noValidate className="space-y-5">{error&&<Notice tone="error">{error}</Notice>}<Field label="Email" type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)}/><SubmitButton loading={loading} loadingText="Requesting link…">Send reset link</SubmitButton></form>}
    {localMailCapture&&<p className="mt-5 text-sm">Local testing: email is captured here. <Link to="/dev/inbox" className="link">Open captured email inbox</Link></p>}
  </AuthShell>;
}
