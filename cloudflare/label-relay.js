// Brick Finder label relay: a Cloudflare Worker that fetches Brick Architect's label
// files for the app. Browsers won't let a web page read files from brickarchitect.com,
// but they will from here, because this adds the header that allows it.
//
// It only fetches brickarchitect.com/label/<part number>.lbx, nothing else.
//   GET  /label/3001.lbx  -> the label file, or 404 if Brick Architect has no label
//   HEAD /label/3001.lbx  -> the same answer without the file
//
// Set up: Cloudflare dashboard -> Workers & Pages -> Create -> Worker ("Hello World"),
// name it e.g. "brick-labels", Deploy, then Edit code, paste this file over the
// example and Deploy again. See README.md ("Printing labels in batches").

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: CORS });
    }
    const match = new URL(request.url).pathname.match(/^\/label\/([A-Za-z0-9._-]{1,40})\.lbx$/);
    if (!match) return new Response('Not found', { status: 404, headers: CORS });

    const upstream = await fetch(`https://brickarchitect.com/label/${match[1]}.lbx`, {
      cf: { cacheEverything: true, cacheTtlByStatus: { '200-299': 86400, '404': 3600, '500-599': 0 } },
    });
    const body = upstream.ok ? new Uint8Array(await upstream.arrayBuffer()) : null;
    // A real label file is a ZIP (starts with "PK"); anything else means there's no label.
    const isLabel = body && body.length > 4 && body[0] === 0x50 && body[1] === 0x4b;
    if (!isLabel) {
      const status = upstream.status >= 500 ? 502 : 404;
      return new Response(status === 404 ? 'Brick Architect has no label for this part' : 'Brick Architect is unavailable', { status, headers: CORS });
    }
    return new Response(request.method === 'HEAD' ? null : body, {
      headers: {
        ...CORS,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(body.length),
        'Cache-Control': 'public, max-age=86400',
      },
    });
  },
};
