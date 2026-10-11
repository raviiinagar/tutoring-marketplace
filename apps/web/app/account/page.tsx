'use client';
import {useEffect,useState} from 'react';
import type {Account} from '@tutoring/contracts';
export default function AccountPage(){
  const [user,setUser]=useState<Account|null>(null);const [error,setError]=useState('');
  useEffect(()=>{fetch('/v1/me',{credentials:'include'}).then(async response=>{if(response.status===401){window.location.replace('/auth/signin');return;}if(!response.ok)throw new Error();setUser((await response.json()).user);}).catch(()=>setError('Unable to load your account.'));},[]);
  async function logout(){try{const response=await fetch('/v1/auth/sessions/current',{method:'DELETE',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw new Error();window.location.replace('/auth/signin');}catch{setError('Unable to sign out. Please try again.');}}
  return <section><h1>Your account</h1>{error&&<p role="alert" className="error">{error}</p>}{user?<><h2>{user.display_name}</h2><p>{user.email}</p><p className="notice">Email verified</p><p>Your account is ready. Learner profiles and tutor discovery will follow in upcoming tasks.</p><button onClick={logout}>Sign out</button></>:<p>Loading account…</p>}</section>;
}
