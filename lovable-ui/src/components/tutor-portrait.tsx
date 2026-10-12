import {useEffect,useState} from 'react';
import {assetUrl} from '@/lib/api';
export function TutorPortrait({url,name,className=''}:{url?:string|undefined;name:string;className?:string}){
 const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[url]);
 return url&&!failed?<img src={assetUrl(url)} alt={`${name}, Tutor`} loading="lazy" className={className} onError={()=>setFailed(true)}/>:null;
}
