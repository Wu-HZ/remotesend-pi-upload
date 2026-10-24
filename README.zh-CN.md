# 通过 RemoteSend 上传 — Pi 插件

**这个独立 GitHub 仓库分发的是插件本身，不是 APK、ZIP 等编译产物。** 其它设备可以下载、安装插件；插件在本机调用正在运行的 RemoteSend，把编译产物上传到 RemoteSend 已配置的 WebDAV 文件仓库，其它设备在 RemoteSend 文件页下载产物。

## 安装

1. 在运行 Pi 的电脑上打开 RemoteSend，配置并启用 WebDAV **文件服务器**，在 **设置 → 本机上传 API** 中开启接口，复制 API 令牌。上传期间 RemoteSend 必须保持运行。
2. 在任何项目目录都可安装一次全局 Pi 插件：`pi install git:github.com/Wu-HZ/remotesend-pi-upload`。已有 Pi 会话用 `/reload` 加载；更新可运行 `pi update git:github.com/Wu-HZ/remotesend-pi-upload`。也可以从本仓库下载源码后 `pi install <本仓库的本机路径>`。
3. **在启动 Pi 前**把本机令牌放入 `REMOTESEND_API_TOKEN` 环境变量（不能通过插件参数、聊天消息或仓库文件传令牌），每台设备使用其自己的令牌。例如 PowerShell：

   ```powershell
   $secret = Read-Host 'RemoteSend API 令牌' -AsSecureString
   $env:REMOTESEND_API_TOKEN = (New-Object System.Net.NetworkCredential('', $secret)).Password
   pi
   ```

   如果 Pi 已在运行，需要退出后在设置好环境变量的终端重新启动。

编译完成后让 Pi 调用工具 `remotesend_upload`，参数 `{"path":"build/app/outputs/flutter-apk/app-release.apk"}`；也可传 `overwrite:true` 显式覆盖远端同名文件（默认加随机后缀保留旧文件）、`timeoutSeconds` 调整等待时间。工具会等待 **WebDAV 实际上传完成** 才报告成功，结果包含 `/RemoteSend/Files/...` 远端路径；失败返回错误，不会把“已入队”当成功。

令牌允许从本机读取文件并上传到配置的 WebDAV；不要提交、分享令牌或 RemoteSend 配置。这个插件不读取 WebDAV 密码、不访问 GitHub，也不产生编译产物的 GitHub 公共下载链接。详见 [English README](README.md)。
