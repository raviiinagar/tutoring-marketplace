import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {InputHTMLAttributes,ReactNode} from 'react';
import {TutorIntroductionWizard} from '@/components/tutor-introduction-wizard';
import {api,type ApiResult,type Catalogue,type TutorOnboardingDraft,type TutorState} from '@/lib/api';

vi.mock('@tanstack/react-router',()=>({Link:({to,children}:{to:string;children:ReactNode})=><a href={to}>{children}</a>}));
// The host AuthShell normally enables Field through AccountReady. This focused
// component test supplies accessible native fields without mocking API behavior.
vi.mock('@/components/account/ui',()=>({
  Field:({label,hint,error,...props}:InputHTMLAttributes<HTMLInputElement>&{label:string;hint?:string;error?:string})=><label>{label}<input {...props}/>{hint&&<span>{hint}</span>}{error&&<span>{error}</span>}</label>,
  Notice:({children}:{children:ReactNode})=><div>{children}</div>,
}));
const catalogue:Catalogue={domains:[],terms:[{id:'subject-physics',kind:'SUBJECT',label:'Physics',aliases:[],domain_ids:[],active:true},{id:'subject-hindi',kind:'SUBJECT',label:'Hindi',aliases:[],domain_ids:[],active:true}]};
const biography='Patient explanations, worked examples and guided practice help learners understand Physics.';
const completed:TutorState={profile:null,claims:[],evidence:[]};
let saved:TutorOnboardingDraft|null;
const onCompleted=vi.fn();
const failure=(status:number,code:string,message:string)=>({ok:false as const,error:{kind:'http' as const,status,code,message}});
function mount(key='first'){return render(<TutorIntroductionWizard key={key} catalogue={catalogue} onCompleted={onCompleted}/>);}
async function submit(){await act(async()=>{fireEvent.submit(screen.getByRole('button',{name:/^(Next|Save profile and continue)$/}).closest('form')!);});}
async function reachReview(){
  await screen.findByRole('heading',{name:'Which subjects do you teach?'});
  fireEvent.click(screen.getByRole('checkbox',{name:'Physics'}));await submit();
  await screen.findByRole('heading',{name:'Tell learners about yourself'});
  fireEvent.change(screen.getByLabelText('Your public name'),{target:{value:'Fictional teacher'}});
  fireEvent.change(screen.getByLabelText(/^About you, skills and experience/),{target:{value:biography}});await submit();
  await screen.findByRole('heading',{name:'Set your hourly rate'});
  fireEvent.change(screen.getByLabelText(/^Hourly tuition rate/),{target:{value:'725.50'}});await submit();
  await screen.findByRole('heading',{name:'Your private identity details'});
  fireEvent.change(screen.getByLabelText('Identity country'),{target:{value:'OTHER'}});
  fireEvent.click(screen.getByRole('checkbox',{name:/I am at least 18/}));await submit();
  await screen.findByRole('heading',{name:'Review your introduction'});
}
beforeEach(()=>{
  saved=null;onCompleted.mockReset();
  vi.spyOn(api,'tutorOnboardingDraft').mockImplementation(async()=>({ok:true,status:200,data:{draft:saved}}));
  vi.spyOn(api,'saveTutorOnboardingDraft').mockImplementation(async input=>{
    saved={revision:input.revision+1,step:input.step,data:structuredClone(input.data),updated_at:'2026-11-04T00:00:00Z'};
    return {ok:true,status:200,data:{draft:saved}};
  });
  vi.spyOn(api,'saveTutorIntroduction').mockResolvedValue({ok:true,status:200,data:completed});
  vi.spyOn(api,'clearTutorOnboardingDraft').mockResolvedValue({ok:true,status:204,data:undefined});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});

it('starts an empty draft privately and does not advance or write without a subject',async()=>{
  mount();await screen.findByRole('heading',{name:'Which subjects do you teach?'});
  expect(screen.getByText('Not saved yet')).toBeVisible();await submit();
  expect(screen.getByText('Choose at least one subject.')).toBeVisible();
  expect(api.saveTutorOnboardingDraft).not.toHaveBeenCalled();expect(api.saveTutorIntroduction).not.toHaveBeenCalled();
});

it('resumes an incomplete server draft and allows explicit private saving without publishing',async()=>{
  saved={revision:7,step:1,data:{display_name:'Partial name',biography:'Unfinished',subject_ids:['subject-physics']},updated_at:'2026-11-04T00:00:00Z'};
  mount();await screen.findByRole('heading',{name:'Tell learners about yourself'});
  expect(screen.getByLabelText('Your public name')).toHaveValue('Partial name');
  expect(screen.getByLabelText(/^About you, skills and experience/)).toHaveValue('Unfinished');
  fireEvent.click(screen.getByRole('button',{name:'Save private draft'}));
  await waitFor(()=>expect(api.saveTutorOnboardingDraft).toHaveBeenCalledWith(expect.objectContaining({revision:7,step:1,data:expect.objectContaining({biography:'Unfinished'})})));
  expect(api.saveTutorIntroduction).not.toHaveBeenCalled();expect(onCompleted).not.toHaveBeenCalled();
});

it('persists each stage with the latest draft revision and saves a profile only after final confirmation',async()=>{
  mount();await reachReview();
  const calls=vi.mocked(api.saveTutorOnboardingDraft).mock.calls.map(([input])=>input);
  expect(calls.map(input=>[input.revision,input.step])).toEqual([[0,1],[1,2],[2,3],[3,4]]);
  expect(calls[3]!.data).toMatchObject({display_name:'Fictional teacher',biography,subject_ids:['subject-physics'],hourly_rate_paise:72550,identity_country:'OTHER',identity_document:'PASSPORT',adult_confirmed:true});
  expect(calls.every(input=>!('replace_identity' in input.data)&&!('expected_public_revision' in input.data))).toBe(true);
  expect(api.saveTutorIntroduction).not.toHaveBeenCalled();expect(api.clearTutorOnboardingDraft).not.toHaveBeenCalled();
  await submit();await waitFor(()=>expect(onCompleted).toHaveBeenCalledWith(completed,undefined));
  expect(api.saveTutorIntroduction).toHaveBeenCalledExactlyOnceWith({display_name:'Fictional teacher',biography,subject_ids:['subject-physics'],hourly_rate_paise:72550,identity_country:'OTHER',identity_document:'PASSPORT',adult_confirmed:true,public_email_consent:false,replace_identity:false});
  expect(api.clearTutorOnboardingDraft).toHaveBeenCalledExactlyOnceWith(4);
  expect(vi.mocked(api.saveTutorIntroduction).mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(api.clearTutorOnboardingDraft).mock.invocationCallOrder[0]!);
});

it('keeps the current stage and values after a failed save and retries the same revision',async()=>{
  vi.mocked(api.saveTutorOnboardingDraft).mockResolvedValueOnce(failure(503,'UNAVAILABLE','Save temporarily unavailable.'));
  mount();await screen.findByRole('heading',{name:'Which subjects do you teach?'});fireEvent.click(screen.getByRole('checkbox',{name:'Physics'}));await submit();
  await waitFor(()=>expect(screen.getByRole('button',{name:'Next'})).toBeEnabled());
  expect(screen.getByRole('checkbox',{name:'Physics'})).toBeChecked();expect(screen.getByRole('heading',{name:'Which subjects do you teach?'})).toBeVisible();
  await submit();await screen.findByRole('heading',{name:'Tell learners about yourself'});
  expect(vi.mocked(api.saveTutorOnboardingDraft).mock.calls.map(([input])=>input.revision)).toEqual([0,0]);expect(api.saveTutorIntroduction).not.toHaveBeenCalled();
});

it('preserves an incomplete working copy and its expected revision after a stale draft conflict',async()=>{
  saved={revision:4,step:1,data:{display_name:'Earlier name',biography:'Saved incomplete copy',subject_ids:['subject-physics']},updated_at:'2026-11-04T00:00:00Z'};
  vi.mocked(api.saveTutorOnboardingDraft).mockResolvedValue(failure(409,'DRAFT_CHANGED','Your saved draft changed. Refresh before overwriting it.'));
  mount();await screen.findByRole('heading',{name:'Tell learners about yourself'});fireEvent.change(screen.getByLabelText('Your public name'),{target:{value:'My unsaved correction'}});
  fireEvent.click(screen.getByRole('button',{name:'Save private draft'}));await screen.findByText('Your saved draft changed. Refresh before overwriting it.');
  expect(screen.getByLabelText('Your public name')).toHaveValue('My unsaved correction');expect(api.tutorOnboardingDraft).toHaveBeenCalledTimes(1);
  expect(api.clearTutorOnboardingDraft).not.toHaveBeenCalled();expect(api.saveTutorIntroduction).not.toHaveBeenCalled();
  expect(api.saveTutorOnboardingDraft).toHaveBeenCalledWith(expect.objectContaining({revision:4,step:1}));
});

it('keeps review details and draft when final profile saving fails',async()=>{
  vi.mocked(api.saveTutorIntroduction).mockResolvedValue(failure(409,'PROFILE_CHANGED','Your profile changed. Refresh before saving again.'));
  mount();await reachReview();await submit();await screen.findByText('Your profile changed. Refresh before saving again.');
  expect(screen.getByRole('heading',{name:'Review your introduction'})).toBeVisible();expect(screen.getByText(biography)).toBeVisible();
  expect(api.clearTutorOnboardingDraft).not.toHaveBeenCalled();expect(onCompleted).not.toHaveBeenCalled();
});

it('ignores an old account draft response after unmount and keeps a newly mounted draft isolated',async()=>{
  let resolveOld!:(result:ApiResult<{draft:TutorOnboardingDraft|null}>)=>void;
  vi.mocked(api.tutorOnboardingDraft).mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;}));
  const first=mount();await waitFor(()=>expect(api.tutorOnboardingDraft).toHaveBeenCalledOnce());first.unmount();
  saved={revision:2,step:1,data:{display_name:'Second account only'},updated_at:'2026-11-04T00:00:00Z'};mount('second');await screen.findByRole('heading',{name:'Tell learners about yourself'});
  await act(async()=>resolveOld({ok:true,status:200,data:{draft:{revision:99,step:1,data:{display_name:'Old account private name'},updated_at:'2026-11-04T00:00:00Z'}}}));
  expect(screen.getByLabelText('Your public name')).toHaveValue('Second account only');expect(screen.queryByDisplayValue('Old account private name')).not.toBeInTheDocument();
});

it('does not clear drafts or call completion when an in-flight profile save resolves after unmount',async()=>{
  let finish!:(result:ApiResult<TutorState>)=>void;
  vi.mocked(api.saveTutorIntroduction).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const view=mount();await reachReview();await submit();await waitFor(()=>expect(api.saveTutorIntroduction).toHaveBeenCalledOnce());view.unmount();
  await act(async()=>finish({ok:true,status:200,data:completed}));
  expect(api.clearTutorOnboardingDraft).not.toHaveBeenCalled();expect(onCompleted).not.toHaveBeenCalled();
});

it('reports successful profile saving while retaining a concurrently newer draft on cleanup conflict',async()=>{
  vi.mocked(api.clearTutorOnboardingDraft).mockResolvedValue(failure(409,'DRAFT_CHANGED','A newer draft exists.'));
  mount();await reachReview();await submit();
  await waitFor(()=>expect(onCompleted).toHaveBeenCalledOnce());
  expect(onCompleted.mock.calls[0]![0]).toEqual(completed);
  expect(onCompleted.mock.calls[0]![1]).toMatch(/draft/i);
  expect(api.clearTutorOnboardingDraft).toHaveBeenCalledExactlyOnceWith(4);
  expect(api.saveTutorIntroduction).toHaveBeenCalledOnce();
});
