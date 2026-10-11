import {useEffect,useRef,type CSSProperties,type ReactNode} from 'react';

/** Visible without JavaScript; motion starts only once the observer is ready. */
export function Reveal({children,className='',delay=0}:{children:ReactNode;className?:string;delay?:number}){
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const element=ref.current;
    if(!element||!('IntersectionObserver' in window)||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){element.dataset['reveal']='visible';observer.disconnect();}
    },{threshold:0.08});
    element.dataset['reveal']='pending';observer.observe(element);
    return()=>{observer.disconnect();delete element.dataset['reveal'];};
  },[]);
  return <div ref={ref} className={`scroll-reveal ${className}`} style={{'--reveal-delay':`${delay}ms`} as CSSProperties}>{children}</div>;
}
