import {createFileRoute,Link} from '@tanstack/react-router';
import {useEffect,useRef,useState} from 'react';
import {api,describeFailure,type TutorPhoto} from '@/lib/api';
import {AuthShell,Field,Notice,useSingleFlight} from '@/components/account/ui';
import {Button} from '@/components/ui/button';
export const Route=createFileRoute('/staff_/photos')({ssr:false,component:PhotoReviews,head:()=>({meta:[{title:'Tutor photo review — Tutor Marketplace'},{name:'robots',content:'noindex'}]})});
function PhotoReviews(){
 const [photos,setPhotos]=useState<(TutorPhoto&{display_name:string})[]>([]);
 const [reason,setReason]=useState('');
 const [selected,setSelected]=useState<string>();
 const [image,setImage]=useState<string>();
 const [error,setError]=useState<string>();
 const [fetching,setFetching]=useState(true);
 const [accessRequired,setAccessRequired]=useState(false);
 const url=useRef<string|undefined>(undefined);
 const live=useRef(false);
 const {loading,run}=useSingleFlight();
 const clear=()=>{if(url.current)URL.revokeObjectURL(url.current);url.current=undefined;setImage(undefined);setSelected(undefined);};
 const load=async()=>{
  setFetching(true);setError(undefined);setAccessRequired(false);clear();setPhotos([]);
  const result=await api.tutorPhotoQueue();
  if(!live.current)return;
  if(result.ok)setPhotos(result.data.photos);
  else{setError(describeFailure(result.error));setAccessRequired(result.error.kind==='http'&&[401,403].includes(result.error.status));}
  setFetching(false);
 };
 useEffect(()=>{live.current=true;void load();return()=>{live.current=false;if(url.current)URL.revokeObjectURL(url.current);};},[]);
 const inspect=(id:string)=>run(async()=>{
  setError(undefined);clear();const result=await api.inspectTutorPhoto(id,reason.trim());
  if(!live.current)return;
  if(result.ok){url.current=URL.createObjectURL(result.data);setImage(url.current);setSelected(id);}
  else setError(describeFailure(result.error));
 });
 const review=(id:string,outcome:'APPROVE'|'REJECT'|'REVOKE')=>run(async()=>{
  setError(undefined);const result=await api.reviewTutorPhoto(id,outcome,reason.trim());
  if(!live.current)return;
  if(result.ok)await load();else setError(describeFailure(result.error));
 });
 const busy=loading||fetching;
 return <AuthShell title="Tutor photo review" intro="Trust scope and staff MFA are required. Approve an appropriate adult portrait; never publish identity documents or child photos." footer={<Link to="/staff" className="link">Back to staff console</Link>}>
  {error&&<Notice tone="error">{error}</Notice>}
  {accessRequired&&<Link to="/staff" className="link mt-3 inline-block">Verify staff access</Link>}
  {fetching?<p role="status">Loading photo queue…</p>:!error&&photos.length===0?<section className="rounded-xl border bg-secondary p-5" aria-labelledby="empty-photo-queue">
   <h2 id="empty-photo-queue" className="font-semibold">No Tutor photos available for review</h2>
   <p className="mt-2 text-sm text-muted-foreground">A Tutor must first upload a portrait from their Tutor profile, under Public Tutor photo. Once the photo passes scanning, it appears here for review.</p>
   <p className="mt-3 text-sm text-muted-foreground">Identity documents use the separate Tutor evidence review. Rejected or removed photos do not appear in this queue.</p>
  </section>:null}
  {!fetching&&photos.length>0&&<>
   <Field label="Reason for photo review" value={reason} maxLength={240} onChange={e=>setReason(e.target.value)} hint="Record a 10–240 character purpose and decision reason."/>
   <div className="mt-5 space-y-4">{photos.map(photo=><article key={photo.id} className="space-y-3 rounded-lg border p-4">
    <h2 className="font-semibold">{photo.display_name}</h2><p className="text-sm">Photo: {photo.status}</p>
    <Button variant="outline" disabled={busy||reason.trim().length<10} onClick={()=>void inspect(photo.id)}>Inspect photo</Button>
    {selected===photo.id&&image&&<><img src={image} alt="Tutor portrait submitted for review" className="aspect-[4/5] w-48 rounded-xl object-cover"/><div className="flex flex-wrap gap-2">
     {photo.status==='PENDING'?<><Button disabled={busy||reason.trim().length<10} onClick={()=>void review(photo.id,'APPROVE')}>Approve photo</Button><Button variant="outline" disabled={busy||reason.trim().length<10} onClick={()=>void review(photo.id,'REJECT')}>Reject photo</Button></>:<Button variant="outline" disabled={busy||reason.trim().length<10} onClick={()=>void review(photo.id,'REVOKE')}>Revoke photo</Button>}
    </div></>}
   </article>)}</div>
  </>}
  <Button variant="outline" className="mt-5" disabled={busy} onClick={()=>void run(load)}>{fetching?'Loading photos…':'Refresh photo queue'}</Button>
 </AuthShell>;
}
