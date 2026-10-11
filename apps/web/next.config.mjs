/** The local UI is an integration harness; Lovable will provide the final interface. */
export default {
  async rewrites() {
    const api = process.env.API_INTERNAL_URL || "http://127.0.0.1:4000";
    return [
      { source: "/v1/:path*", destination: `${api}/v1/:path*` },
      { source: "/dev/:path*", destination: `${api}/dev/:path*` },
    ];
  },
};

