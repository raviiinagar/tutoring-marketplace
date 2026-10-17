import {createFileRoute,redirect} from '@tanstack/react-router';
import {api} from '@/lib/api';
import {publicHead,requirePublic} from '@/lib/public-pages';
import {TeacherPage,PublicRefresh,PublicTeacherMissing} from '@/components/public-pages';
export const Route=createFileRoute('/teachers/$slug')({notFoundComponent:PublicTeacherMissing,staleTime:0,preloadStaleTime:0,loader:async({params})=>{const page=requirePublic(await api.publicTeacher(params.slug));if(page.redirect_to)throw redirect({href:page.redirect_to,statusCode:301});return page;},head:({loaderData})=>publicHead(loaderData?.seo),component:Page});
function Page(){return <><PublicRefresh/><TeacherPage page={Route.useLoaderData()}/></>;}
