import { stat } from "node:fs/promises";
import { request } from "node:http";
import { basename, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// Only the port may be overridden for isolated tests. Never send credentials
// to an arbitrary URL or a proxy; RemoteSend binds to 127.0.0.1 by default.
const port = Number(process.env.REMOTESEND_API_PORT ?? "38764");

type UploadJob = {
  id: string;
  status: "pending" | "uploading" | "completed" | "failed";
  progress?: number;
  fileName?: string;
  remotePath?: string;
  error?: string;
};

async function api(path: string, token: string, signal?: AbortSignal, body?: object): Promise<UploadJob> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid local RemoteSend API port");
  }
  const payload = body ? JSON.stringify(body) : undefined;
  const requestSignal = AbortSignal.any(
    signal ? [signal, AbortSignal.timeout(15_000)] : [AbortSignal.timeout(15_000)],
  );
  return new Promise<UploadJob>((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1", port, path,
      method: payload ? "POST" : "GET", signal: requestSignal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 16_384) {
          req.destroy(new Error("RemoteSend response is too large"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => {
        let result: Record<string, unknown>;
        try {
          result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          reject(new Error(`Invalid RemoteSend API response (HTTP ${response.statusCode})`));
          return;
        }
        if ((response.statusCode ?? 500) >= 400) {
          reject(new Error(`RemoteSend HTTP ${response.statusCode}: ${String(result.error ?? "request failed").slice(0, 300)}`));
          return;
        }
        if (typeof result.id !== "string" || typeof result.status !== "string") {
          reject(new Error("Invalid RemoteSend upload job response"));
          return;
        }
        resolve(result as UploadJob);
      });
    });
    req.on("error", (error) => {
      if (signal?.aborted) reject(new Error("Request cancelled; the upload may still be running in RemoteSend"));
      else reject(new Error(`Cannot reach the running RemoteSend local API: ${error.name}`));
    });
    req.end(payload);
  });
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "remotesend_upload",
    label: "Upload via RemoteSend",
    description: "Upload one compiled APK, ZIP or other local file via the running RemoteSend desktop app to its currently selected WebDAV file server. Wait for real completion and return the RemoteSend remote path. Recipients can download in RemoteSend. Not a GitHub upload.",
    promptSnippet: "Upload a completed build with RemoteSend and report the final transfer status",
    parameters: Type.Object({
      path: Type.String({ description: "Local file path, absolute or relative to this Pi project's directory" }),
      overwrite: Type.Optional(Type.Boolean({ description: "Replace the existing WebDAV basename; default false adds a unique suffix" })),
      timeoutSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 7200, description: "Wait limit; default 3600 seconds" })),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const token = process.env.REMOTESEND_API_TOKEN?.trim();
      if (!token) throw new Error("Set REMOTESEND_API_TOKEN before starting Pi (copy it from RemoteSend Settings). Never commit this token.");
      const absolute = resolve(ctx.cwd, params.path.replace(/^@/, ""));
      if (!(await stat(absolute)).isFile()) throw new Error("Build artifact must be an existing file");
      const job = await api("/v1/uploads", token, signal, { path: absolute, overwrite: params.overwrite === true });
      onUpdate?.({ content: [{ type: "text", text: `Queued ${basename(absolute)} in RemoteSend (${job.id})...` }] });
      const deadline = Date.now() + (params.timeoutSeconds ?? 3600) * 1000;
      let previousProgress = -1;
      while (Date.now() < deadline) {
        const current = await api(`/v1/uploads/${encodeURIComponent(job.id)}`, token, signal);
        if (current.status === "failed") throw new Error(`RemoteSend upload failed: ${current.error ?? "unknown error"}`);
        if (current.status === "completed") {
          if (!current.remotePath?.startsWith("/RemoteSend/Files/")) {
            throw new Error("RemoteSend did not return a file depot path");
          }
          return {
            content: [{ type: "text", text: `Uploaded via RemoteSend: ${current.remotePath}\nOther devices can download it in RemoteSend's file depot.` }],
            details: { remotePath: current.remotePath, fileName: current.fileName, status: current.status },
          };
        }
        const progress = Math.floor((current.progress ?? 0) * 100);
        if (progress !== previousProgress) {
          previousProgress = progress;
          onUpdate?.({ content: [{ type: "text", text: `RemoteSend upload: ${progress}%` }] });
        }
        await delay(1000, undefined, { signal });
      }
      throw new Error(`Timed out waiting for ${job.id}; RemoteSend may still finish in the background`);
    },
  });
}
