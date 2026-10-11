import {useEffect,useState} from 'react';
import {api,describeFailure,type Catalogue,type CatalogueKind} from '@/lib/api';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {BookOpen,ArrowUpRight} from 'lucide-react';

export const catalogueLabels:Record<CatalogueKind,string>={SUBJECT:'Subjects',LEVEL:'Learner levels',CURRICULUM:'Curricula',EXAM:'Exam tracks',LANGUAGE:'Teaching languages'};
const normalize=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function CatalogueBrowser({query='',clearSearch}:{query?:string;clearSearch?:()=>void}){
  const [catalogue,setCatalogue]=useState<Catalogue>();const [error,setError]=useState<string>();const [selected,setSelected]=useState<string>();
  const load=async()=>{setError(undefined);const result=await api.catalogue();if(result.ok)setCatalogue(result.data);else setError(describeFailure(result.error));};
  useEffect(()=>{void load();},[]);
  const search=normalize(query);
  const visible=catalogue?.domains.filter(domain=>!search||normalize(domain.label).includes(search)||catalogue.terms.some(term=>term.domain_ids.includes(domain.id)&&[term.label,...term.aliases].some(name=>normalize(name).includes(search))));
  const domain=catalogue?.domains.find(item=>item.id===selected);
  return <section id="subjects" aria-labelledby="subjects-title" className="mx-auto max-w-7xl scroll-mt-6 px-5 py-12 lg:px-8 lg:py-16">
    <h2 id="subjects-title" className="text-3xl font-semibold sm:text-4xl">Explore learning domains</h2>
    <p className="mt-3 text-sm text-muted-foreground">Browse subjects, exam tracks and learning levels across India. Tutor discovery is coming soon.</p>
    {query&&<Button variant="outline" className="my-4" onClick={clearSearch}>Clear search: {query}</Button>}
    {error?<div role="alert" className="mt-6"><p>{error}</p><Button onClick={()=>void load()}>Retry catalogue</Button></div>:!catalogue?<p role="status" className="mt-6">Loading learning domains…</p>:<>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{visible?.map(item=><Button key={item.id} variant="outline" onClick={()=>setSelected(item.id)} className="subject-card relative flex h-auto min-h-44 flex-col items-start justify-start whitespace-normal rounded-lg bg-card p-5 text-left">
        <BookOpen className="mb-4 size-6 text-coral-strong"/><ArrowUpRight aria-hidden className="absolute right-5 top-6 size-4"/>
        <span className="font-display text-lg font-semibold">{item.label}</span><span className="mt-2 text-xs font-normal text-muted-foreground">{catalogue.terms.filter(term=>term.domain_ids.includes(item.id)&&term.kind==='SUBJECT').slice(0,3).map(term=>term.label).join(' · ')}</span>
      </Button>)}</div>
      <p role="status" className="mt-4 text-sm text-muted-foreground">{visible?.length} learning domains{query?` matching “${query}”`:''}.</p>
      {visible?.length===0&&<p className="mt-4">No matching learning domains. Try another subject or exam name.</p>}
    </>}
    <Dialog open={!!domain} onOpenChange={open=>{if(!open)setSelected(undefined);}}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">{domain&&catalogue&&<>
      <DialogTitle>{domain.label}</DialogTitle><DialogDescription>Explore the available catalogue options. Tutor discovery is coming soon; these options do not confirm tutor availability.</DialogDescription>
      {(Object.keys(catalogueLabels) as CatalogueKind[]).map(kind=>{const terms=catalogue.terms.filter(term=>term.kind===kind&&term.domain_ids.includes(domain.id));return terms.length>0&&<section key={kind}><h3 className="font-semibold">{catalogueLabels[kind]}</h3><ul className="mt-2 flex flex-wrap gap-2">{terms.map(term=><li key={term.id} className="rounded-md bg-secondary px-3 py-1 text-sm">{term.label}</li>)}</ul></section>;})}
    </>}</DialogContent></Dialog>
  </section>;
}
