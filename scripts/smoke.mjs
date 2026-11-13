import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

assert.ok(process.versions.bun, 'Run this check with Bun');
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const password = randomBytes(24).toString('hex');
const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '-p', String(port), '--hostname', '127.0.0.1'],
  {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PASSWORD: password,
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);
let output = '';
server.stdout.on('data', (chunk) => {
  output += chunk;
});
server.stderr.on('data', (chunk) => {
  output += chunk;
});
const base = `http://127.0.0.1:${port}`;
const request = (path, options = {}) =>
  fetch(base + path, { ...options, signal: AbortSignal.timeout(5000) });
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error(`Server exited: ${output}`);
    try {
      const response = await request('/api/status');
      if (response.ok) {
        await response.text();
        ready = true;
        break;
      }
      await response.body?.cancel();
    } catch {
      /* Wait for the production listener. */
    }
    await delay(250);
  }
  assert.ok(ready, `Server did not become ready: ${output}`);
  const home = await request('/');
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.ok(/CineIsle/i.test(html), 'Homepage must identify CineIsle');
  const asset = html.match(/(?:src|href)="(\/_next\/static\/[^" ]+)"/);
  assert.ok(asset, 'Homepage must include a built static asset');
  const staticResponse = await request(asset[1]);
  assert.equal(staticResponse.status, 200);
  await staticResponse.arrayBuffer();
  const status = await (await request('/api/status')).json();
  assert.equal(status.passwordRequired, true);
  const input = {
    wd: 'runtime-smoke',
    sources: [{ key: 'private', name: 'blocked', url: 'http://127.0.0.1:9/api.php' }],
  };
  const anonymous = await request('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  assert.equal(anonymous.status, 401);
  await anonymous.text();
  const auth = await request('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  assert.equal(auth.status, 200);
  const cookie = auth.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  await auth.text();
  const authenticated = await (await request('/api/auth', { headers: { cookie } })).json();
  assert.equal(authenticated.verified, true);
  const stream = await request('/api/search?stream=1', {
    method: 'POST',
    headers: { cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  assert.equal(stream.status, 200);
  const events = (await stream.text())
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(events.at(-1).type, 'done');
  assert.equal(events.at(-1).failures[0].sourceKey, 'private');
  assert.equal(events.at(-1).list.length, 0);
  console.log(
    `Bun ${process.versions.bun}: production HTML, assets, authentication, streaming and SSRF checks passed`
  );
} finally {
  const closed = once(server, 'close');
  server.kill();
  await closed;
}
