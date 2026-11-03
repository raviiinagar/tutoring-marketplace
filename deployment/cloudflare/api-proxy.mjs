const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const error = (status, code, message) => Response.json({ code, message }, {status, headers:{"Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow"}});
/** Fixed-origin forwarding; never rewrite the browser's security Origin. */
export async function proxyApi(request, upstreamOrigin, fetchUpstream = fetch) {
  const url = new URL(request.url);
  let upstream;
  try { upstream=new URL(upstreamOrigin); } catch { return error(503,"API_UNAVAILABLE","The API is unavailable."); }
  if(upstream.protocol !== "https:" || upstream.username || upstream.password || upstream.pathname !== "/" || upstream.search || upstream.hash) return error(503,"API_UNAVAILABLE","The API is unavailable.");
  if(url.pathname !== "/v1" && !url.pathname.startsWith("/v1/")) return error(404,"NOT_FOUND","Not found.");
  let decoded;
  try { decoded=decodeURIComponent(url.pathname); } catch { return error(400,"INVALID_PATH","Invalid API path."); }
  if(decoded.includes("\\") || decoded.split("/").some(part=>part==="." || part==="..")) return error(400,"INVALID_PATH","Invalid API path.");
  if(unsafeMethods.has(request.method) && request.headers.get("Origin") !== url.origin) return error(403,"ORIGIN_NOT_ALLOWED","Request origin is not allowed.");
  const target = new URL(upstream.origin); target.pathname=url.pathname;target.search=url.search;
  const forwarded = new Request(target, request);
  for(const key of ["host","forwarded","x-forwarded-for","x-forwarded-host","x-forwarded-proto","connection"]) forwarded.headers.delete(key);
  try {
    const response = await fetchUpstream(forwarded, {redirect:"manual"});
    const headers = new Headers(response.headers);
    headers.set("Cache-Control","no-store");headers.set("X-Content-Type-Options","nosniff");headers.set("X-Robots-Tag","noindex, nofollow");
    // Do not consume or clone the body: evidence uploads and SSE must stream.
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  } catch { return error(502,"API_UNAVAILABLE","The API is temporarily unavailable. Please retry."); }
}
