import renderer from "./index.mjs";
import { proxyApi } from "./api-proxy.mjs";
export default {
  async fetch(request, env, context) {
    const path = new URL(request.url).pathname;
    if(path === "/v1" || path.startsWith("/v1/")) return proxyApi(request,env.API_INTERNAL_URL);
    const response = await renderer.fetch(request,env,context);
    const headers = new Headers(response.headers);
    headers.set("X-Robots-Tag","noindex, nofollow");headers.set("X-Content-Type-Options","nosniff");
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  }
};
