import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { request } from '../core/http.mjs';

test('requests to the same server reuse one connection', async t => {
  let connections = 0;
  const server = http.createServer((req, res) => { res.end('segment'); });
  server.on('connection', () => { connections++; });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/seg`;
  for (let i = 0; i < 5; i++) {
    const response = await request(`${url}${i}.ts`);
    let body = '';
    for await (const chunk of response) body += chunk;
    assert.equal(body, 'segment');
  }
  assert.equal(connections, 1, 'five sequential segments used one connection');
});
test('a destroyed response is never reused for the next request', async t => {
  const server = http.createServer((req, res) => { res.write('partial'); });
  let connections = 0;
  server.on('connection', () => { connections++; });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const url = `http://127.0.0.1:${server.address().port}/a`;
  for (let i = 0; i < 2; i++) { const response = await request(url); response.destroy(); }
  assert.equal(connections, 2);
});
