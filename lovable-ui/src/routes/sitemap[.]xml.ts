import {createFileRoute} from '@tanstack/react-router';
import {api} from '@/lib/api';
export const Route=createFileRoute('/sitemap.xml')({server:{handlers:{GET:async()=>{const result=await api.publicSitemap();return new Response(result.ok?await result.data.text():'Temporarily unavailable',{status:result.ok?200:503,headers:{'Content-Type':result.ok?'application/xml; charset=utf-8':'text/plain','Cache-Control':'no-store'}});}}}});
