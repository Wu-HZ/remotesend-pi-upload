# 通过 RemoteSend 上传 — Pi 插件

**这个独立 GitHub 仓库分发的是插件本身，不是 APK、ZIP 等编译产物。** 其它设备可以下载、安装插件；插件在本机调用正在运行的 RemoteSend，把编译产物上传到 RemoteSend 已配置的 WebDAV 文件仓库，其它设备在 RemoteSend 文件页下载产物。

## 安装

1. 在运行 Pi 的电脑上打开 RemoteSend，配置并启用 WebDAV **文件服务器**，在 **设置 → 本机上传 API** 中开启接口，复制 API 令牌。上传期间 RemoteSend 必须保持运行。
2. 在任何项目目录都可安装一次全局 Pi 插件：`pi install git:github.com/Wu-HZ/remotesend-pi-upload`。已有 Pi 会话用 `/reload` 加载；更新可运行 `pi update git:github.com/Wu-HZ/remotesend-pi-upload`。也可以从本仓库下载源码后 `pi install <本仓库的本机路径>`。
3. 在 Pi 里运行一次 **`/remotesend-config`**，在**隐藏输入框**粘贴从 RemoteSend 设置复制的本机 API 令牌，按 Enter 保存。以后在任意项目、每次启动 Pi 都自动读取，**不用反复输入或设置环境变量**；当前 Pi 会话也立即生效。

   - `/remotesend-config status`：查看是否配置（**不显示令牌**）。
   - `/remotesend-config clear`：删除本机保存的令牌。RemoteSend 里轮换令牌后，再执行 `/remotesend-config` 粘贴新令牌即可。
   - 配置文件保存在 Pi **用户目录** `~/.pi/agent/remotesend-upload.json`（Windows 为 `%USERPROFILE%\.pi\agent\remotesend-upload.json`；设置了 `PI_CODING_AGENT_DIR` 时随之改变），不在编译项目里。文件是明文，Unix 权限为 0600，Windows 依赖用户目录权限；请保护本机账户和备份，不要提交/分享这个文件或把令牌发到聊天。
   - 自动化脚本仍可选择设置 `REMOTESEND_API_TOKEN` 环境变量覆盖已保存的令牌；日常使用无需设置。如果之前设置了旧环境变量，先移除它，避免覆盖新令牌。

编译完成后让 Pi 调用工具 `remotesend_upload`，参数 `{"path":"build/app/outputs/flutter-apk/app-release.apk"}`；也可传 `overwrite:true` 显式覆盖远端同名文件（默认加随机后缀保留旧文件）、`timeoutSeconds` 调整等待时间。工具会等待 **WebDAV 实际上传完成** 才报告成功，结果包含 `/RemoteSend/Files/...` 远端路径；失败返回错误，不会把“已入队”当成功。

令牌允许从本机读取文件并上传到配置的 WebDAV；不要提交、分享令牌或 RemoteSend 配置。这个插件不读取 WebDAV 密码、不访问 GitHub，也不产生编译产物的 GitHub 公共下载链接。详见 [English README](README.md)。
