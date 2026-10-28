'use client';
import { use, useEffect, useState } from 'react';

export default function AuthPage({params}:{params:Promise<{step:string}>}){
  const {step}=use(params);
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [token,setToken]=useState('');const [verified,setVerified]=useState(false);
  useEffect(()=>{if(step==='verify'){const value=new URLSearchParams(window.location.hash.slice(1)).get('token');if(value)setToken(value);window.history.replaceState(null,'',window.location.pathname);}},[step]);
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setError('');setBusy(true);
    const values=Object.fromEntries(new FormData(event.currentTarget));
    const endpoint=step==='signup'?'registrations':step==='signin'?'sessions':step==='check-email'?'verification-emails':'verifications';
    try{
      const response=await fetch('/v1/auth/'+endpoint,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(step==='verify'?{token}:values)});
      const body=await response.json();
      if(!response.ok){setError(body.message||'Please try again.');return;}
      if(step==='check-email'){setError(body.message);return;}
      if(step==='verify')setVerified(true);else window.location.assign(step==='signup'?'/auth/check-email':'/account');
    }catch{setError('Unable to reach the account service. Please try again.');}finally{setBusy(false);}
  }
  if(step==='check-email')return <section><h1>Check your email</h1><p>If this email can be registered, a verification link will arrive shortly. Links expire in 15 minutes.</p><a href="/auth/signin">Sign in after verifying</a><form onSubmit={submit}><label>Need a fresh link? Enter your email<input name="email" type="email" required autoComplete="email"/></label><button disabled={busy}>Send new verification email</button>{error&&<p role="status">{error}</p>}</form>{process.env.NODE_ENV==='development'&&<p className="notice">Local development only: <a href="/dev/inbox">Open captured email inbox</a></p>}</section>;
  if(!['signup','signin','verify'].includes(step))return <section><h1>Page unavailable</h1><a href="/">Go home</a></section>;
  return <section><h1>{step==='signup'?'Create your account':step==='signin'?'Welcome back':'Verify your email'}</h1>{verified?<><p role="status">Email verified. You can now sign in.</p><a href="/auth/signin">Sign in</a></>:<form onSubmit={submit}>
    {step==='signup'&&<label>Display name<input name="display_name" required minLength={2} maxLength={80} autoComplete="name"/></label>}
    {step!=='verify'&&<><label>Email<input name="email" type="email" required maxLength={254} autoComplete="email"/></label><label>Password<input name="password" type="password" required minLength={step==='signup'?8:1} maxLength={128} autoComplete={step==='signup'?'new-password':'current-password'}/></label>{step==='signup'&&<small>Use 12–128 characters.</small>}</>}
    {step==='verify'&&<p>Select the button to confirm your email. Opening this page does not use the link.</p>}
    {error&&<p role="alert" className="error">{error}</p>}
    <button disabled={busy||(step==='verify'&&!token)}>{busy?'Please wait…':step==='signup'?'Create account':step==='signin'?'Sign in':'Verify email'}</button>
    {step==='verify'&&!token&&<p role="alert">Open the complete link from your verification email.</p>}
  </form>}<p><a href={step==='signup'?'/auth/signin':'/auth/signup'}>{step==='signup'?'Already registered? Sign in':'Create an account'}</a></p></section>;
}
