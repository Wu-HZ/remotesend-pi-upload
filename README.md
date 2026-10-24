# Upload via RemoteSend — Pi extension

[简体中文说明](README.zh-CN.md)

A small [Pi](https://pi.dev) tool for uploading compiled files **through your running RemoteSend desktop app**. This repository distributes the **plugin**, not the artifacts you upload. Each machine can download/install the plugin from GitHub; uploaded files go to the WebDAV file depot configured in that machine's RemoteSend, where your other RemoteSend devices can browse and download them.

## Setup

1. Install RemoteSend on the machine where Pi runs; configure and enable a WebDAV **files server**. In **Settings → Local upload API**, enable the API and copy its token. Leave RemoteSend running while uploading.
2. Install this plugin globally for all Pi projects:

   ```sh
   pi install git:github.com/Wu-HZ/remotesend-pi-upload
   ```

   Alternatively, download this repository from GitHub and run `pi install /path/to/remotesend-pi-upload`. Use `pi update git:github.com/Wu-HZ/remotesend-pi-upload` to update. In a running Pi session, use `/reload` after installation.
3. In Pi, run **`/remotesend-config` once**, paste the Local upload API token into the **masked input**, then press Enter. The extension saves it in your *user-level* Pi configuration (`~/.pi/agent/remotesend-upload.json`, or the directory selected by `PI_CODING_AGENT_DIR`) and reads it automatically on every launch and in every project. **No environment variable or repeated entry is needed.** An already-running Pi can use it immediately.

   `/remotesend-config status` shows whether a token is available **without displaying it**; `/remotesend-config clear` removes the saved token. Run `/remotesend-config` again after rotating your token in RemoteSend. For CI, `REMOTESEND_API_TOKEN` can still be set as an optional override; its presence takes precedence over the saved value.

   This local config file is plaintext but is created with owner-only permissions (0600 on Unix, under your Windows user profile on Windows). Protect your OS account and backups; **do not copy the config into a project, pass the token in tool arguments or chat, or commit it**. Never give Pi WebDAV credentials; it only needs the separate RemoteSend API token.

## Usage

After building another project, ask Pi to use the `remotesend_upload` tool:

```json
{"path":"build/app/outputs/flutter-apk/app-release.apk"}
```

- `path`: absolute or relative to Pi's current project directory.
- `overwrite`: optional, defaults to `false` (RemoteSend adds a unique suffix instead of replacing an older build). Only set `true` when replacing the remote basename is intended.
- `timeoutSeconds`: optional, defaults to 3600 seconds, max 7200.

The tool calls `POST http://127.0.0.1:38764/v1/uploads`, polls `GET /v1/uploads/{id}`, and reports success **only when the WebDAV upload has completed**. On success it returns a path such as `/RemoteSend/Files/app-release-<unique>.apk`. Other devices can download the artifact from their RemoteSend file page using the same WebDAV server. GitHub hosts **only this plugin** and does not provide browser download links for your build artifacts.

The RemoteSend API listens only on localhost and requires a separate bearer token. Whoever has that token can upload any local readable file to your configured WebDAV server. Review generated build outputs before authorizing an AI agent to upload them. This plugin never reads RemoteSend's `config.json` or WebDAV passwords, never calls GitHub, and never sends the bearer token to a proxy.

## Development

Requires Node.js 20+ and Pi. Install development dependencies with `npm install` and run `npm test`. The tests start a local fake RemoteSend HTTP server and never contact a real WebDAV server.

License: Apache-2.0.
