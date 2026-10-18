import { createServer, request } from "node:http";
import { createGzip } from "node:zlib";
// Test-only same-origin proxy for the built Nitro UI. Never imported by a release.
if (
  !process.env.DEV_DATABASE_DIR?.includes("browser-tests") ||
  process.env.PLAYWRIGHT_BUILT_UI !== "true"
)
  throw new Error("Isolated browser stack required");
const port = Number(process.env.BROWSER_FRONT_PORT),
  uiPort = Number(process.env.BROWSER_UI_PORT);
if (
  !Number.isInteger(port) ||
  !Number.isInteger(uiPort) ||
  port < 1024 ||
  uiPort < 1024 ||
  port === uiPort
)
  throw new Error("Invalid isolated browser ports");
createServer((incoming, response) => {
  const api =
    incoming.url?.startsWith("/v1/") || incoming.url?.startsWith("/dev/mail");
  const upstream = request(
    {
      hostname: "127.0.0.1",
      port: api ? 4100 : uiPort,
      path: incoming.url,
      method: incoming.method,
      headers: incoming.headers,
    },
    (remote) => {
      // Deployment Caddy enables zstd/gzip. Match its text compression, never buffer SSE.
      const gzip =
        !api &&
        /\bgzip\b/.test(incoming.headers["accept-encoding"] || "") &&
        !remote.headers["content-encoding"] &&
        /text\/|javascript|json|svg/.test(remote.headers["content-type"] || "");
      const headers = { ...remote.headers };
      if (gzip) {
        delete headers["content-length"];
        headers["content-encoding"] = "gzip";
        headers.vary = "Accept-Encoding";
      }
      response.writeHead(remote.statusCode || 502, headers);
      if (gzip) {
        const encoder = createGzip();
        encoder.on("error", () => response.destroy());
        remote.pipe(encoder).pipe(response);
      } else remote.pipe(response);
      remote.on("error", () => response.destroy());
    },
  );
  upstream.on("error", () => {
    if (!response.headersSent) response.writeHead(502);
    response.end();
  });
  response.on("close", () => upstream.destroy());
  incoming.pipe(upstream);
}).listen(port, "127.0.0.1");
