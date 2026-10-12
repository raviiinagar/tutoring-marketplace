import {createFileRoute,Link} from '@tanstack/react-router';
import {useEffect,useRef,useState} from 'react';
import {api,describeFailure} from '@/lib/api';
import {AuthShell,Notice,useSingleFlight} from '@/components/account/ui';
import {Button} from '@/components/ui/button';
export const Route=createFileRoute('/availability/$action')({ssr:false,component:AvailabilityLink,head:()=>({meta:[{title:'Availability alert — Tutor Marketplace'},{name:'robots',content:'noindex'},{name:'referrer',content:'no-referrer'}]})});
function AvailabilityLink(){
  const {action}=Route.useParams();const token=useRef<string|null>(null);const [ready,setReady]=useState(false);const [error,setError]=useState<string>();const [done,setDone]=useState(false);const {loading,run}=useSingleFlight();const verify=action==='verify';const validAction=verify||action==='unsubscribe';
  useEffect(()=>{const found=new URLSearchParams(window.location.hash.slice(1)).get('token');if(found){token.current=found;window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);}setReady(true);},[]);
  const apply=()=>run(async()=>{if(!token.current)return;setError(undefined);const r=verify?await api.confirmAvailability(token.current):await api.unsubscribeAvailability(token.current);if(r.ok){token.current=null;setDone(true);}else setError(describeFailure(r.error));});
  return <AuthShell title={done?(verify?'Availability alert confirmed':'Availability alert unsubscribed'):verify?'Confirm availability alert':'Unsubscribe availability alert'} footer={<Link to="/tutors" className="link">Back to Tutor search</Link>}>
    {error&&<Notice tone="error">{error}</Notice>}{done?<Notice tone="success">{verify?'Your alert is active for up to 90 days. It is optional and does not enable paid access or marketing emails.':'Your availability alert has been stopped.'}</Notice>:!ready?<p role="status">Reading your email link…</p>:!validAction||!token.current||!/^[A-Za-z0-9_-]{43}$/.test(token.current)?<Notice tone="info">Open the complete link from your availability email. This link cannot be used.</Notice>:<div className="space-y-5"><p className="text-sm text-muted-foreground">{verify?'Confirm your own email to receive one alert matching your chosen filters. Use the unsubscribe link in the same email whenever you want to stop.':'Press the button to stop these availability alerts. This does not change your account or any other notification preferences.'}</p><Button disabled={loading} className="w-full" onClick={()=>void apply()}>{loading?'Saving…':verify?'Confirm availability alert':'Unsubscribe availability alert'}</Button></div>}
  </AuthShell>;
}
