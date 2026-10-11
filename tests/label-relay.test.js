import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import relay from '../cloudflare/label-relay.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// Brick Architect: 3001 has a label, 99999 gives its "not found" page, 500 is down.
function fakeBrickArchitect(calls = []) {
  globalThis.fetch = async (url) => {
    calls.push(url);
    if (url.endsWith('/3001.lbx')) return new Response(new Uint8Array([0x50, 0x4b, 3, 4, 9, 9]), { status: 200 });
    if (url.endsWith('/500.lbx')) return new Response('oops', { status: 503 });
    return new Response('<html>Not found</html>', { status: 200, headers: { 'content-type': 'text/html' } });
  };
}

const call = (path, method = 'GET') => relay.fetch(new Request(`https://relay.example${path}`, { method }));

test('passes label files through with the header browsers need', async () => {
  const calls = [];
  fakeBrickArchitect(calls);
  const res = await call('/label/3001.lbx');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [0x50, 0x4b, 3, 4, 9, 9]);
  assert.deepEqual(calls, ['https://brickarchitect.com/label/3001.lbx']);
  const head = await call('/label/3001.lbx', 'HEAD');
  assert.equal(head.status, 200);
});

test('a missing label is a 404, Brick Architect being down is a 502', async () => {
  fakeBrickArchitect();
  assert.equal((await call('/label/99999.lbx')).status, 404);
  assert.equal((await call('/label/99999.lbx', 'HEAD')).status, 404);
  assert.equal((await call('/label/500.lbx')).status, 502);
});

test('fetches nothing but Brick Architect labels', async () => {
  const calls = [];
  fakeBrickArchitect(calls);
  for (const path of ['/', '/label/../secret', '/label/3001.png', '/other/3001.lbx', '/label/a%2Fb.lbx']) {
    assert.equal((await call(path)).status, 404, path);
  }
  assert.equal((await call('/label/3001.lbx', 'POST')).status, 405);
  assert.equal((await call('/label/3001.lbx', 'OPTIONS')).headers.get('access-control-allow-methods'), 'GET, HEAD, OPTIONS');
  assert.deepEqual(calls, []);
});
