import {createFileRoute} from '@tanstack/react-router';
import {api} from '@/lib/api';
export const Route=createFileRoute('/robots.txt')({server:{handlers:{GET:async()=>{const result=await api.publicRobots();return new Response(result.ok?await result.data.text():'Temporarily unavailable',{status:result.ok?200:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});}}}});
