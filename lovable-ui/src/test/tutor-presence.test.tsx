import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {TutorPresenceEditor} from '@/components/tutor-presence-editor';
import {api,type TutorPresence} from '@/lib/api';
import {AuthShell} from '@/components/account/ui';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
vi.mock('@tanstack/react-router',()=>({Link:({children}:any)=><a>{children}</a>}));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const presence:TutorPresence={revision:0,location:null,teaching_modes:['ONLINE'],accepting_students:null,weekly_slots:[],timezone:'Asia/Kolkata',updated_at:null};
function mount(){vi.spyOn(api,'me').mockResolvedValue({ok:false,error:{kind:'http',status:401,code:'AUTH_REQUIRED',message:'Sign in'}});return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><AuthShell title="Preferences"><TutorPresenceEditor/></AuthShell></QueryClientProvider>);}
it('saves city, mode, accepting status and weekly hours then shows the saved result',async()=>{
 vi.spyOn(api,'tutorPresence').mockResolvedValue({ok:true,status:200,data:{presence}});
 const save=vi.spyOn(api,'saveTutorPresence').mockImplementation(async body=>({ok:true,status:200,data:{presence:{...body,revision:1,updated_at:'2026-11-01T12:00:00Z'},offers_need_review:0}}));
 mount();await screen.findByLabelText('Public city');
 fireEvent.change(screen.getByLabelText('Public city'),{target:{value:'Mumbai'}});fireEvent.click(screen.getByLabelText('In-person classes'));fireEvent.click(screen.getByRole('button',{name:'Add teaching hours'}));
 fireEvent.change(screen.getByLabelText('Start time 1'),{target:{value:'17:00'}});fireEvent.click(screen.getByRole('button',{name:'Save location and availability'}));
 await screen.findByText('Location and availability saved.');expect(save).toHaveBeenCalledWith(expect.objectContaining({expected_revision:0,location:{city:'Mumbai',country:'India'},teaching_modes:['ONLINE','IN_PERSON'],accepting_students:true,weekly_slots:[{day:'MON',start_minute:1020,end_minute:1080}]}));
 expect(screen.getByText('Saved public preferences')).toBeInTheDocument();
});
it('keeps unsaved changes visible when a stale revision needs refresh',async()=>{
 vi.spyOn(api,'tutorPresence').mockResolvedValue({ok:true,status:200,data:{presence}});
 vi.spyOn(api,'saveTutorPresence').mockResolvedValue({ok:false,error:{kind:'http',status:409,code:'PRESENCE_CHANGED',message:'Your location or hours changed. Refresh before saving.'}});
 mount();await screen.findByLabelText('Public city');fireEvent.change(screen.getByLabelText('Public city'),{target:{value:'Pune'}});fireEvent.click(screen.getByRole('button',{name:'Save location and availability'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Refresh location settings'})).toBeVisible());expect(screen.getByLabelText('Public city')).toHaveValue('Pune');expect(screen.queryByText('Location and availability saved.')).toBeNull();
});
