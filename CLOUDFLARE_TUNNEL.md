# Cloudflare Tunnel 固定隧道部署

这个方案把公网固定域名转发到本机的 `http://localhost:3000`，适合先把 Maps Leads 工具快速放到公网测试。

## 前提

- 本机的 Maps Leads 服务已运行：`http://localhost:3000`
- 域名所在 DNS zone 已接入 Cloudflare。推荐使用：`maplead.eeconnect.co`
- 如果域名仍只在 Namecheap DNS 管理，需要先把域名 NS 切到 Cloudflare，或在 Cloudflare 中添加对应 zone 后再做隧道域名路由。

## 一次性初始化

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-cloudflare-fixed-tunnel.ps1 -Hostname maplead.eeconnect.co -TunnelName eeconnect-mapleads
```

脚本会：

- 下载/复用 `cloudflared`
- 打开 Cloudflare 登录授权
- 创建 named tunnel
- 生成本机 tunnel config
- 给域名创建 Cloudflare DNS route

## 日常启动

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-server.ps1
powershell -ExecutionPolicy Bypass -File scripts\run-cloudflare-fixed-tunnel.ps1 -TunnelName eeconnect-mapleads
```

启动后访问：

```text
https://maplead.eeconnect.co
```

## 可选：用 nomadsfi 子域名

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-cloudflare-fixed-tunnel.ps1 -Hostname mapleads.nomadsfi.com -TunnelName eeconnect-mapleads
```

同样要求 `nomadsfi.com` 这个 DNS zone 在 Cloudflare 里。
