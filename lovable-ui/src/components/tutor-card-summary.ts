import type {TutorPresence} from '@/lib/api';
const tuition=new Intl.NumberFormat('en-IN',{maximumFractionDigits:2});
export const compactTutorRate=(paise:number)=>'₹'+tuition.format(paise/100);
export function compactTutorLocation(presence?:TutorPresence,mode?:'ONLINE'|'IN_PERSON'|'BOTH'){
  const city=presence?.location?.city?.trim();
  const modes=mode==='BOTH'?['ONLINE','IN_PERSON']:mode?[mode]:(presence?.teaching_modes??['ONLINE']);
  const label=modes.map(m=>m==='ONLINE'?'online':'in person').join(' & ');
  return [city,`(${label})`].filter(Boolean).join(' ');
}
