import {createFileRoute,Link} from '@tanstack/react-router';
import {SiteHeader} from '@/components/account/ui';
import {MarketplaceMetricsDesk} from '@/components/marketplace-metrics';
export const Route=createFileRoute('/staff_/metrics')({ssr:false,head:()=>({meta:[{title:'Marketplace value | Tutor Marketplace'},{name:'robots',content:'noindex'}]}),component:Page});
function Page(){return <div className="min-h-screen"><SiteHeader/><main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-5 py-10"><Link to="/staff" className="link">Back to staff console</Link><h1 className="my-6 text-3xl font-semibold sm:text-4xl">Delivered marketplace value</h1><MarketplaceMetricsDesk/></main></div>;}
