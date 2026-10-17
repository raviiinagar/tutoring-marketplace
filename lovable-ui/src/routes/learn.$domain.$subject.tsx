import {createFileRoute} from '@tanstack/react-router';
import {api} from '@/lib/api';
import {publicHead,requirePublic} from '@/lib/public-pages';
import {CategoryPage,PublicRefresh} from '@/components/public-pages';
export const Route=createFileRoute('/learn/$domain/$subject')({staleTime:0,preloadStaleTime:0,loader:async({params})=>requirePublic(await api.publicCategory(params.domain,params.subject)),head:({loaderData})=>publicHead(loaderData?.seo),component:Page});
function Page(){return <><PublicRefresh/><CategoryPage page={Route.useLoaderData()}/></>;}
