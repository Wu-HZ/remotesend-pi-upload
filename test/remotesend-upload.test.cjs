const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { createServer } = require('node:http');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test, before, after } = require('node:test');
const { createJiti } = require('jiti');

let tool;
let server;
let mode = 'completed';
const requests = [];
const context = { cwd: mkdtempSync(path.join(tmpdir(), 'pi-rs-upload-')) };
const artifact = path.join(context.cwd, 'app.apk');
writeFileSync(artifact, 'compiled');
const oldToken = process.env.REMOTESEND_API_TOKEN;
const oldPort = process.env.REMOTESEND_API_PORT;

before(async () => {
  server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ url: req.url, authorization: req.headers.authorization, body });
    const data = req.method === 'POST'
      ? { id: 'upload_1', status: 'pending', remotePath: '/RemoteSend/Files/app-unique.apk' }
      : mode === 'failed'
        ? { id: 'upload_1', status: 'failed', error: 'Cannot connect to server' }
        : { id: 'upload_1', status: 'completed', fileName: 'app-unique.apk',
            remotePath: '/RemoteSend/Files/app-unique.apk' };
    res.writeHead(req.method === 'POST' ? 202 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.REMOTESEND_API_PORT = String(server.address().port);
  const jiti = createJiti(__filename);
  const extension = jiti(path.join(__dirname, '..', 'extensions', 'remotesend-upload.ts')).default;
  extension({ registerTool(definition) { tool = definition; } });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(context.cwd, { recursive: true, force: true });
  if (oldToken === undefined) delete process.env.REMOTESEND_API_TOKEN;
  else process.env.REMOTESEND_API_TOKEN = oldToken;
  if (oldPort === undefined) delete process.env.REMOTESEND_API_PORT;
  else process.env.REMOTESEND_API_PORT = oldPort;
});

test('the Pi tool uploads via RemoteSend and waits for completion', async () => {
  mode = 'completed';
  requests.length = 0;
  process.env.REMOTESEND_API_TOKEN = 'local-secret';
  const result = await tool.execute('test', { path: 'app.apk' }, undefined, () => {}, context);
  assert.equal(tool.name, 'remotesend_upload');
  assert.match(result.content[0].text, /RemoteSend\/Files\/app-unique.apk/);
  assert.equal(result.details.status, 'completed');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, '/v1/uploads');
  assert.equal(requests[1].url, '/v1/uploads/upload_1');
  assert.deepEqual(JSON.parse(requests[0].body), { path: artifact, overwrite: false });
  assert.equal(requests[0].authorization, 'Bearer local-secret');
  assert.ok(!JSON.stringify(result).includes('local-secret'));
});

test('explicit overwrite is passed through but not enabled by default', async () => {
  mode = 'completed';
  requests.length = 0;
  const result = await tool.execute('test', { path: 'app.apk', overwrite: true }, undefined, undefined, context);
  assert.equal(result.details.status, 'completed');
  assert.equal(JSON.parse(requests[0].body).overwrite, true);
});

test('missing API token fails before uploading', async () => {
  delete process.env.REMOTESEND_API_TOKEN;
  requests.length = 0;
  await assert.rejects(() => tool.execute('test', { path: 'app.apk' }, undefined, undefined, context),
    /REMOTESEND_API_TOKEN/);
  assert.equal(requests.length, 0);
  process.env.REMOTESEND_API_TOKEN = 'local-secret';
});

test('RemoteSend failure does not return a success path', async () => {
  mode = 'failed';
  await assert.rejects(() => tool.execute('test', { path: 'app.apk' }, undefined, undefined, context),
    /Cannot connect to server/);
});
