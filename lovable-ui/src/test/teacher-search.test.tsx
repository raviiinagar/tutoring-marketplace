import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {TeacherSearchBar} from '@/components/teacher-search-bar';
import {api,type Catalogue} from '@/lib/api';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const catalogue:Catalogue={domains:[],terms:[{id:'subject-mathematics',kind:'SUBJECT',label:'Mathematics',aliases:['Maths','Math'],domain_ids:['school'],active:true},{id:'subject-physics',kind:'SUBJECT',label:'Physics',aliases:[],domain_ids:['school'],active:true}],combinations:[]} as Catalogue;
it('subject aliases and a city produce independent, typed search filters',async()=>{
 vi.spyOn(api,'tutorLocations').mockResolvedValue({ok:true,status:200,data:{locations:[]}});const search=vi.fn();render(<TeacherSearchBar catalogue={catalogue} onSearch={search}/>);
 const subject=await screen.findByRole('combobox',{name:'Subject or exam'});fireEvent.change(subject,{target:{value:'Maths'}});
 fireEvent.click(screen.getByRole('option',{name:'Mathematics'}));const location=screen.getByRole('combobox',{name:'Class location'});fireEvent.change(location,{target:{value:'Mumbai'}});
 fireEvent.click(screen.getByRole('option',{name:'Mumbai, India'}));fireEvent.click(screen.getByRole('button',{name:'Search'}));
 expect(search).toHaveBeenCalledWith({subject_id:'subject-mathematics',teaching_mode:'IN_PERSON',location:'Mumbai',country:'India'});
});
it('Online search clears locality and works with keyboard selection',async()=>{
 vi.spyOn(api,'tutorLocations').mockResolvedValue({ok:true,status:200,data:{locations:[]}});const search=vi.fn();render(<TeacherSearchBar catalogue={catalogue} onSearch={search}/>);
 const location=await screen.findByRole('combobox',{name:'Class location'});fireEvent.focus(location);fireEvent.keyDown(location,{key:'Enter'});fireEvent.click(screen.getByRole('button',{name:'Search'}));
 expect(search).toHaveBeenCalledWith({teaching_mode:'ONLINE'});expect(screen.queryByRole('listbox')).toBeNull();
});
it('unknown subjects do not silently search unrelated teachers and Escape closes suggestions',async()=>{
 const search=vi.fn();render(<TeacherSearchBar catalogue={catalogue} onSearch={search}/>);const input=await screen.findByRole('combobox',{name:'Subject or exam'});
 fireEvent.change(input,{target:{value:'Nonexistent subject'}});fireEvent.submit(screen.getByRole('form',{name:'Find a teacher'}));
 await screen.findByRole('alert');expect(search).not.toHaveBeenCalled();fireEvent.keyDown(input,{key:'Escape'});await waitFor(()=>expect(screen.queryByRole('listbox')).toBeNull());
});
