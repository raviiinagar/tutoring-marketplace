import {createFileRoute,Link,useNavigate} from '@tanstack/react-router';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {api,describeFailure,type ApiFailure,type StaffAccess,type StaffEnrollment,type StaffScope,type StaffWorkspace} from '@/lib/api';
import {AuthShell,Field,Notice,SubmitButton,useSingleFlight} from '@/components/account/ui';
import {Button} from '@/components/ui/button';

export const Route=createFileRoute('/staff')({ssr:false,component:StaffConsole,head:()=>({meta:[{title:'Staff console — Tutor Marketplace'},{name:'robots',content:'noindex'}]})});
const labels:Record<StaffScope,string>={SUPPORT:'Support',TRUST:'Trust',FINANCE:'Finance'};
function StaffConsole(){
  const navigate=useNavigate();const [access,setAccess]=useState<StaffAccess>();const [denied,setDenied]=useState(false);const [error,setError]=useState<string>();
  const [password,setPassword]=useState('');const [code,setCode]=useState('');const [recovery,setRecovery]=useState(false);const [enrollment,setEnrollment]=useState<StaffEnrollment>();const [backups,setBackups]=useState<string[]>([]);
  const [workspace,setWorkspace]=useState<StaffWorkspace>();const [reason,setReason]=useState('');const {loading,run}=useSingleFlight();
  const fail=useCallback((failure:ApiFailure)=>{if(failure.kind==='http'&&failure.status===401&&failure.code==='UNAUTHENTICATED'){void navigate({to:'/auth/signin',replace:true});return;}setError(describeFailure(failure));},[navigate]);
  const load=useCallback(async()=>{
    const result=await api.staffAccess();
    if(result.ok){setAccess(result.data);setDenied(false);if(!result.data.authenticated)setWorkspace(undefined);}
    else if(result.error.kind==='http'&&result.error.code==='STAFF_ACCESS_DENIED'){setDenied(true);setAccess(undefined);setWorkspace(undefined);}
    else fail(result.error);
  },[fail]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(!access?.expires_at)return;const timer=setTimeout(()=>void load(),Math.max(0,new Date(access.expires_at).getTime()-Date.now()+100));return()=>clearTimeout(timer);},[access?.expires_at,load]);
  const submit=(event:FormEvent)=>{event.preventDefault();void run(async()=>{
    setError(undefined);
    if(recovery){const result=await api.recoverMfa(password,code.trim());if(result.ok){setRecovery(false);setCode('');setPassword('');setEnrollment(undefined);setBackups([]);await load();}else fail(result.error);}
    else if(enrollment){const result=await api.confirmMfa(code.trim());if(result.ok){setBackups(result.data.recovery_codes);setEnrollment(undefined);setCode('');setPassword('');await load();}else fail(result.error);}
    else if(!access?.mfa_enrolled){const result=await api.enrollMfa(password);if(result.ok){setEnrollment(result.data);setPassword('');}else fail(result.error);}
    else{const result=await api.staffSignIn(password,code.trim());if(result.ok){setPassword('');setCode('');await load();}else fail(result.error);}
  });};
  const open=(scope:StaffScope)=>run(async()=>{setError(undefined);setWorkspace(undefined);setReason('');const result=await api.staffWorkspace(scope);if(result.ok)setWorkspace(result.data);else{fail(result.error);await load();}});
  const record=(event:FormEvent)=>{event.preventDefault();void run(async()=>{if(!workspace)return;setError(undefined);const result=await api.staffAccessCheck(workspace.scope,reason.trim());if(result.ok){setWorkspace(result.data);setReason('');}else{fail(result.error);await load();}});};
  const signOut=()=>run(async()=>{setError(undefined);const result=await api.staffSignOut();if(result.ok){setWorkspace(undefined);setBackups([]);await load();}else fail(result.error);});
  return <AuthShell title="Staff console" footer={<Link to="/account" className="link">Back to your account</Link>}>
    {error&&<div className="mb-5"><Notice tone="error">{error}</Notice></div>}
    {denied?<Notice tone="info">Staff access has not been assigned to this account. Public accounts cannot assign staff permissions.</Notice>:!access?<p role="status">Loading staff access…</p>:<>
      {backups.length>0&&<section className="mb-6 space-y-3"><h2 className="font-semibold">Save your recovery codes</h2><Notice tone="info">Shown once. Keep these codes in a private password manager. Recovery signs out staff sessions and requires a new authenticator.</Notice><ul className="space-y-1">{backups.map(backup=><li key={backup}><code className="break-all text-xs">{backup}</code></li>)}</ul><Button type="button" onClick={()=>setBackups([])}>I saved my recovery codes</Button></section>}
      {!access.authenticated?<form noValidate onSubmit={submit} className="space-y-5">
        <h2 className="font-semibold">{recovery?'Recover your authenticator':enrollment?'Confirm your authenticator':access.mfa_enrolled?'Verify staff access':'Set up staff MFA'}</h2>
        {enrollment?<><p className="text-sm">Add this key to your authenticator app, then enter its six-digit code. Setup expires in 10 minutes.</p><code className="block break-all rounded-lg border p-3" aria-label="Authenticator setup key">{enrollment.secret}</code><a href={enrollment.otpauth_uri} className="link inline-block">Open authenticator app</a></>:<Field label="Account password" type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)}/>}
        {(recovery||enrollment||access.mfa_enrolled)&&<Field label={recovery?'Recovery code':'Authenticator code'} type={recovery?'password':'text'} inputMode={recovery?'text':'numeric'} autoComplete="one-time-code" value={code} onChange={event=>setCode(event.target.value)} maxLength={recovery?32:6}/>}
        <SubmitButton loading={loading} loadingText="Checking…">{recovery?'Use recovery code':enrollment?'Confirm MFA':access.mfa_enrolled?'Enter staff console':'Create authenticator setup'}</SubmitButton>
        {access.mfa_enrolled&&<Button type="button" variant="outline" disabled={loading} onClick={()=>{setRecovery(!recovery);setCode('');setError(undefined);}}>{recovery?'Use authenticator instead':'Lost your authenticator?'}</Button>}
      </form>:<>
        <p className="text-sm text-muted-foreground">Staff access expires {new Date(access.expires_at!).toLocaleTimeString()}. Only your assigned areas are available.</p>
        <nav aria-label="Staff areas" className="mt-5 flex flex-wrap gap-3">{access.scopes.map(scope=><Button key={scope} variant="outline" disabled={loading} onClick={()=>void open(scope)}>{labels[scope]}</Button>)}</nav>
        {access.scopes.includes('SUPPORT')&&<Link to="/staff/notifications" className="link mt-5 block">Monitor notification delivery</Link>}
        {access.scopes.includes('FINANCE')&&<Link to="/staff/finance" className="link mt-5 block">Manage refunds and reserve</Link>}
        {access.scopes.includes('TRUST')&&<Link to="/staff/reviews" className="link mt-5 block">Moderate connection-linked reviews</Link>}
        {access.scopes.includes('TRUST')&&<Link to="/staff/guardians" className="link mt-5 inline-block">Review Guardian verifications</Link>}
        {access.scopes.includes('TRUST')&&<Link to="/staff/catalogue" className="link mt-5 block">Manage learning catalogue</Link>}
        {access.scopes.includes('TRUST')&&<Link to="/staff/tutors" className="link mt-5 block">Review Tutor evidence</Link>}
        {access.scopes.includes('TRUST')&&<Link to="/staff/photos" className="link mt-5 block">Review Tutor photos</Link>}
        {access.scopes.includes('TRUST')&&<Link to="/staff/safety" className="link mt-5 block">Investigate safety reports</Link>}
        {access.scopes.includes('TRUST')&&<Link to="/staff/listings" className="link mt-5 block">Review teaching offers</Link>}
        {workspace&&<section className="mt-6 space-y-4"><h2 className="font-semibold">{labels[workspace.scope]} workspace</h2><p className="text-sm text-muted-foreground">This area currently contains the access audit trail. Case handling, review and financial workflows will appear as they are implemented.</p><form onSubmit={record} noValidate className="space-y-3"><Field label="Reason for access" hint="10–240 characters. Describe the operational purpose; do not enter credentials or private evidence." value={reason} onChange={event=>setReason(event.target.value)} maxLength={240}/><SubmitButton loading={loading} loadingText="Recording…">Record access reason</SubmitButton></form><h3 className="font-semibold">Recent access records</h3>{workspace.events.length?<ul className="space-y-3">{workspace.events.map(event=><li className="rounded-lg border p-3 text-sm" key={event.id}><p>{event.reason}</p><p className="break-all text-muted-foreground">Actor: {event.actor_id}</p><p>Target: {event.target}</p><p>{new Date(event.created_at).toLocaleString()}</p></li>)}</ul>:<p className="text-sm">No recorded access reasons for this area yet.</p>}</section>}
        <Button type="button" variant="outline" className="mt-6 w-full" disabled={loading} onClick={()=>void signOut()}>Sign out staff access</Button>
      </>}
    </>}
  </AuthShell>;
}
