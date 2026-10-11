import {createFileRoute,Link} from '@tanstack/react-router';
import {useEffect,useState,type FormEvent} from 'react';
import {api,describeFailure,type Catalogue,type CatalogueTerm,type CatalogueKind} from '@/lib/api';
import {AuthShell,Field,Notice,SubmitButton,useSingleFlight} from '@/components/account/ui';
import {Button} from '@/components/ui/button';
import {catalogueLabels} from '@/components/catalogue-browser';
export const Route=createFileRoute('/staff_/catalogue')({ssr:false,component:CatalogueAdmin,head:()=>({meta:[{title:'Catalogue administration — Tutor Marketplace'},{name:'robots',content:'noindex'}]})});
const empty:CatalogueTerm={id:'',label:'',kind:'SUBJECT',aliases:[],domain_ids:[],active:true};
function CatalogueAdmin(){
  const [catalogue,setCatalogue]=useState<Catalogue>();const [term,setTerm]=useState<CatalogueTerm>();const [existing,setExisting]=useState(false);const [aliases,setAliases]=useState('');const [reason,setReason]=useState('');const [error,setError]=useState<string>();const [saved,setSaved]=useState(false);const {loading,run}=useSingleFlight();
  const load=async()=>{const result=await api.staffCatalogue();if(result.ok)setCatalogue(result.data);else{setCatalogue(undefined);setError(describeFailure(result.error));}};
  useEffect(()=>{void load();},[]);
  const edit=(item:CatalogueTerm,isExisting:boolean)=>{setTerm({...item,domain_ids:[...item.domain_ids]});setExisting(isExisting);setAliases(item.aliases.join(', '));setReason('');setSaved(false);setError(undefined);};
  const submit=(event:FormEvent)=>{event.preventDefault();void run(async()=>{if(!term)return;setError(undefined);setSaved(false);const result=await api.saveCatalogueTerm({...term,aliases:aliases.split(',').map(value=>value.trim()).filter(Boolean)},reason.trim());if(result.ok){setTerm(undefined);setSaved(true);await load();}else setError(describeFailure(result.error));});};
  return <AuthShell title="Catalogue administration" intro="Trust staff can maintain catalogue options. Changes require active staff MFA and a recorded reason." footer={<Link to="/staff" className="link">Back to staff console</Link>}>
    {error&&<Notice tone="error">{error}</Notice>}{saved&&<Notice tone="info">Catalogue term saved.</Notice>}
    {!catalogue?<Button onClick={()=>void load()}>Reload staff catalogue</Button>:<>
      <Button className="my-4" onClick={()=>edit(empty,false)}>Add catalogue term</Button>
      {term&&<form onSubmit={submit} className="my-5 space-y-4">
        <h2 className="font-semibold">{existing?'Edit catalogue term':'New catalogue term'}</h2>
        <Field label="Stable identifier" value={term.id} disabled={existing} onChange={event=>setTerm({...term,id:event.target.value})} hint="Lowercase letters, numbers and hyphens. This identifier stays fixed."/>
        <label className="block">Term type<select aria-label="Term type" className="input mt-2" disabled={existing} value={term.kind} onChange={event=>setTerm({...term,kind:event.target.value as CatalogueKind})}>{(Object.keys(catalogueLabels) as CatalogueKind[]).map(kind=><option key={kind} value={kind}>{catalogueLabels[kind]}</option>)}</select></label>
        <Field label="Display label" value={term.label} maxLength={100} onChange={event=>setTerm({...term,label:event.target.value})}/>
        <Field label="Aliases" hint="Separate alternate names with commas. Names must be unique within the term type." value={aliases} onChange={event=>setAliases(event.target.value)}/>
        <fieldset className="space-y-2"><legend className="mb-2 font-semibold">Learning domains</legend>{catalogue.domains.map(domain=><label key={domain.id} className="flex items-center gap-2"><input type="checkbox" checked={term.domain_ids.includes(domain.id)} onChange={event=>setTerm({...term,domain_ids:event.target.checked?[...term.domain_ids,domain.id]:term.domain_ids.filter(id=>id!==domain.id)})}/>{domain.label}</label>)}</fieldset>
        <label className="flex items-center gap-2"><input type="checkbox" checked={term.active} onChange={event=>setTerm({...term,active:event.target.checked})}/>Active in public catalogue</label>
        <Field label="Reason for catalogue change" value={reason} maxLength={240} onChange={event=>setReason(event.target.value)} hint="10–240 characters; describe the operational purpose."/>
        <SubmitButton loading={loading} loadingText="Saving…">Save catalogue term</SubmitButton><Button type="button" variant="outline" disabled={loading} onClick={()=>setTerm(undefined)}>Cancel</Button>
      </form>}
      {(Object.keys(catalogueLabels) as CatalogueKind[]).map(kind=><section key={kind} className="my-6"><h2 className="font-semibold">{catalogueLabels[kind]}</h2><ul className="mt-3 space-y-2">{catalogue.terms.filter(item=>item.kind===kind).map(item=><li key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><span>{item.label}<span className="block text-xs text-muted-foreground">{item.id} · {item.active?'Active':'Inactive'}</span></span><Button variant="outline" disabled={loading} onClick={()=>edit(item,true)} aria-label={`Edit ${item.label} ${kind}`}>Edit</Button></li>)}</ul></section>)}
    </>}
  </AuthShell>;
}
