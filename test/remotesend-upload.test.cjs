const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, statSync, writeFileSync, rmSync } = require('node:fs');
const { createServer } = require('node:http');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test, before, after } = require('node:test');
const { createJiti } = require('jiti');

let tool;
let command;
let extension;
let server;
let inputToken = 'stored-secret';
const notifications = [];
const ui = {
  notify(message) { notifications.push(message); },
  async confirm() { return true; },
  async custom(factory) {
    let complete;
    const result = new Promise((resolve) => { complete = resolve; });
    const component = factory({ requestRender() {} }, {}, {}, complete);
    component.focused = true;
    component.handleInput(`\x1b[200~${inputToken}\x1b[201~`);
    assert.ok(!component.render(70).join('').includes(inputToken), 'the TUI must mask the token');
    component.handleInput('\r');
    return result;
  },
};
const commandContext = { mode: 'tui', hasUI: true, ui };
let mode = 'completed';
const requests = [];
const context = { cwd: mkdtempSync(path.join(tmpdir(), 'pi-rs-upload-')) };
const artifact = path.join(context.cwd, 'app.apk');
writeFileSync(artifact, 'compiled');
const oldToken = process.env.REMOTESEND_API_TOKEN;
const oldPort = process.env.REMOTESEND_API_PORT;
const oldAgentDir = process.env.PI_CODING_AGENT_DIR;

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
  process.env.PI_CODING_AGENT_DIR = context.cwd;
  const jiti = createJiti(__filename);
  extension = jiti(path.join(__dirname, '..', 'extensions', 'remotesend-upload.ts')).default;
  extension({
    registerTool(definition) { tool = definition; },
    registerCommand(name, definition) {
      if (name === 'remotesend-config') command = definition;
    },
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(context.cwd, { recursive: true, force: true });
  if (oldToken === undefined) delete process.env.REMOTESEND_API_TOKEN;
  else process.env.REMOTESEND_API_TOKEN = oldToken;
  if (oldPort === undefined) delete process.env.REMOTESEND_API_PORT;
  else process.env.REMOTESEND_API_PORT = oldPort;
  if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
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
    /remotesend-config/);
  assert.equal(requests.length, 0);
});

test('one-time masked setup saves a private token and works after restarting Pi', async () => {
  notifications.length = 0;
  await command.handler('', commandContext);
  const saved = path.join(context.cwd, 'remotesend-upload.json');
  assert.equal(JSON.parse(readFileSync(saved, 'utf8')).token, 'stored-secret');
  if (process.platform !== 'win32') assert.equal(statSync(saved).mode & 0o777, 0o600);
  assert.ok(!notifications.join(' ').includes('stored-secret'));
  let newTool;
  extension({ registerCommand() {}, registerTool(def) { newTool = def; } });
  requests.length = 0;
  const result = await newTool.execute('test', { path: 'app.apk' }, undefined, undefined, context);
  assert.equal(result.details.status, 'completed');
  assert.equal(requests[0].authorization, 'Bearer stored-secret');
  assert.ok(!JSON.stringify(result).includes('stored-secret'));
});

test('rotation is read immediately; environment override and status never expose tokens', async () => {
  inputToken = 'new-stored-secret';
  await command.handler('', commandContext);
  requests.length = 0;
  await tool.execute('test', { path: 'app.apk' }, undefined, undefined, context);
  assert.equal(requests[0].authorization, 'Bearer new-stored-secret');
  process.env.REMOTESEND_API_TOKEN = 'temporary-override';
  requests.length = 0;
  await tool.execute('test', { path: 'app.apk' }, undefined, undefined, context);
  assert.equal(requests[0].authorization, 'Bearer temporary-override');
  notifications.length = 0;
  await command.handler('status', commandContext);
  assert.match(notifications.join(' '), /overrides saved token/);
  assert.ok(!notifications.join(' ').includes('temporary-override'));
  delete process.env.REMOTESEND_API_TOKEN;
});

test('clear removes saved token without leaking it to the session', async () => {
  await command.handler('clear', commandContext);
  assert.equal(statSync(context.cwd).isDirectory(), true);
  await assert.rejects(() => tool.execute('test', { path: 'app.apk' }, undefined, undefined, context),
    /remotesend-config/);
  await assert.rejects(() => require('node:fs/promises').access(path.join(context.cwd, 'remotesend-upload.json')),
    { code: 'ENOENT' });
  await command.handler('', commandContext);
});

test('bad saved config fails closed without leaking its contents', async () => {
  const saved = path.join(context.cwd, 'remotesend-upload.json');
  writeFileSync(saved, '{"token":"SENSITIVE_BROKEN"');
  await assert.rejects(() => tool.execute('test', { path: 'app.apk' }, undefined, undefined, context),
    (error) => /unreadable/.test(error.message) && !error.message.includes('SENSITIVE_BROKEN'));
  await command.handler('', commandContext);
});

test('RemoteSend failure does not return a success path', async () => {
  mode = 'failed';
  await assert.rejects(() => tool.execute('test', { path: 'app.apk' }, undefined, undefined, context),
    /Cannot connect to server/);
});
