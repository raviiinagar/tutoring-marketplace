import {useEffect,useState} from 'react';
import {publicPortraitUrl} from '@/lib/api';
export function TutorPortrait({url,name,className='',card=false,priority=false}:{url?:string|undefined;name:string;className?:string;card?:boolean;priority?:boolean}){
 const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[url]);
 return url&&!failed?<img src={publicPortraitUrl(url,card?'card':'portrait')} srcSet={card?`${publicPortraitUrl(url,'card')} 384w, ${publicPortraitUrl(url,'portrait')} 640w`:undefined} sizes={card?'(min-width: 1024px) 300px, (min-width: 640px) 46vw, calc(100vw - 40px)':undefined} width={card?384:640} height={card?480:800} alt={`${name}, Tutor`} loading={priority?"eager":"lazy"} fetchPriority={priority?"high":"auto"} className={className} onError={()=>setFailed(true)}/>:null;
}
