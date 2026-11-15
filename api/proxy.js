export const config = { runtime: 'edge' };

export default async function handler(req) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const reqUrl = new URL(req.url);
  const targetUrl = reqUrl.searchParams.get("url");
  if (!targetUrl) {
    return new Response("Missing url parameter", { status: 400, headers: corsHeaders });
  }

  try {
    const forwardHeaders = new Headers();
    forwardHeaders.set("User-Agent", "VLC/3.0.18 LibVLC/3.0.18");
    if (req.headers.has("Range")) {
      forwardHeaders.set("Range", req.headers.get("Range"));
    }

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      redirect: "follow",
    });

    const newHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));

    const contentType = response.headers.get("content-type") || "";
    const finalUrl = response.url || targetUrl;

    if (contentType.includes("mpegurl") || finalUrl.includes(".m3u8")) {
      const text = await response.text();
      const baseUrl = new URL(finalUrl);
      const proxyPrefix = `${reqUrl.origin}/api/proxy?url=`;

      const rewritten = text.split("\n").map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return line;
        const absoluteUrl = new URL(trimmed, baseUrl).href;
        return `${proxyPrefix}${encodeURIComponent(absoluteUrl)}`;
      }).join("\n");

      newHeaders.delete("Content-Length");
      return new Response(rewritten, {
        status: response.status,
        headers: newHeaders,
      });
    }

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  } catch (err) {
    return new Response(`Proxy Error: ${err.message}`, { status: 502, headers: corsHeaders });
  }
}
