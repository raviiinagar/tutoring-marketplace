import {useEffect,useState} from 'react';
import {api,describeFailure,type Catalogue,type CatalogueKind} from '@/lib/api';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {BookOpen,ArrowUpRight,Atom,GraduationCap,Compass,BriefcaseBusiness,Code,Languages,Palette} from 'lucide-react';
import {Reveal} from '@/components/reveal';
import {Link} from '@tanstack/react-router';

export const catalogueLabels:Record<CatalogueKind,string>={SUBJECT:'Subjects',LEVEL:'Learner levels',CURRICULUM:'Curricula',EXAM:'Exam tracks',LANGUAGE:'Teaching languages'};
const normalize=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const domainIcons:Record<string,typeof BookOpen>={school:BookOpen,entrance:Atom,higher:GraduationCap,competitive:Compass,professional:BriefcaseBusiness,career:Code,languages:Languages,arts:Palette};
export function CatalogueBrowser({query='',clearSearch}:{query?:string;clearSearch?:()=>void}){
  const [catalogue,setCatalogue]=useState<Catalogue>();const [error,setError]=useState<string>();const [selected,setSelected]=useState<string>();
  const load=async()=>{setError(undefined);const result=await api.catalogue();if(result.ok)setCatalogue(result.data);else setError(describeFailure(result.error));};
  useEffect(()=>{void load();},[]);
  const search=normalize(query);
  const visible=catalogue?.domains.filter(domain=>!search||normalize(domain.label).includes(search)||catalogue.terms.some(term=>term.domain_ids.includes(domain.id)&&[term.label,...term.aliases].some(name=>normalize(name).includes(search))));
  const domain=catalogue?.domains.find(item=>item.id===selected);
  return <section id="subjects" aria-labelledby="subjects-title" className="mx-auto max-w-7xl scroll-mt-6 px-5 py-12 lg:px-8 lg:py-16">
    <Reveal><p className="mb-3 text-xs font-semibold uppercase tracking-widest text-coral-strong">A world of possibilities</p><h2 id="subjects-title" className="text-3xl font-semibold sm:text-4xl">Explore learning domains</h2>
    <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">Browse subjects, exam tracks and learning levels across India. Search separately for currently available teaching offers.</p></Reveal>
    {query&&<Button variant="outline" className="my-4" onClick={clearSearch}>Clear search: {query}</Button>}
    {error?<div role="alert" className="mt-6"><p>{error}</p><Button onClick={()=>void load()}>Retry catalogue</Button></div>:!catalogue?<p role="status" className="mt-6">Loading learning domains…</p>:<>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{visible?.map((item,index)=>{const Icon=domainIcons[item.id]||BookOpen;return <Reveal key={item.id} delay={index%4*70} className="domain-reveal"><Button variant="outline" onClick={()=>setSelected(item.id)} data-domain={item.id} className="subject-card relative flex h-full min-h-56 w-full flex-col items-start justify-start overflow-hidden whitespace-normal rounded-2xl bg-card p-6 text-left">
        <span className="domain-icon mb-6 grid size-12 place-items-center rounded-2xl"><Icon aria-hidden className="size-6"/></span><ArrowUpRight aria-hidden className="card-arrow absolute right-6 top-7 size-4"/>
        <span className="relative font-display text-lg font-semibold">{item.label}</span><span className="relative mt-2 text-xs font-normal leading-relaxed text-muted-foreground">{catalogue.terms.filter(term=>term.domain_ids.includes(item.id)&&term.kind==='SUBJECT').slice(0,3).map(term=>term.label).join(' · ')}</span>
        <span className="card-explore relative mt-auto pt-5 text-xs font-semibold">Explore this domain <span aria-hidden>→</span></span>
      </Button></Reveal>;})}</div>
      <p role="status" className="mt-4 text-sm text-muted-foreground">{visible?.length} learning domains{query?` matching “${query}”`:''}.</p>
      {visible?.length===0&&<p className="mt-4">No matching learning domains. Try another subject or exam name.</p>}
    </>}
    <Dialog open={!!domain} onOpenChange={open=>{if(!open)setSelected(undefined);}}><DialogContent className="catalogue-dialog max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-xl">{domain&&catalogue&&<>
      <DialogTitle>{domain.label}</DialogTitle><DialogDescription>Explore catalogue options; these options do not confirm tutor availability.</DialogDescription><Button asChild><Link to="/tutors" search={{domain_id:domain.id}}>Find Tutors in this domain</Link></Button>
      {(Object.keys(catalogueLabels) as CatalogueKind[]).map(kind=>{const terms=catalogue.terms.filter(term=>term.kind===kind&&term.domain_ids.includes(domain.id));return terms.length>0&&<section key={kind}><h3 className="font-semibold">{catalogueLabels[kind]}</h3><ul className="mt-2 flex flex-wrap gap-2">{terms.map(term=><li key={term.id} className="catalogue-chip rounded-full bg-secondary px-3 py-1 text-sm">{term.label}</li>)}</ul></section>;})}
    </>}</DialogContent></Dialog>
  </section>;
}
