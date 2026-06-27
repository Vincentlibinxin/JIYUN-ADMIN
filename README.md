# 集运系统后台管理（WEB）

独立后台管理前端项目，API 服务现已可在本目录内独立启动。

## 开发模式（仅本机）

```bash
npm install
npm run dev
```

默认地址：`http://localhost:3002`

## 公网服务启动（推荐）

```bash
npm install
npm run build
npm run start:public
```

公网访问地址：`http://<你的公网IP>:3002`

## 本地 API 启动（当前目录）

```bash
copy .env.api.example .env.api
npm install
npm run api
```

API 默认地址：`http://localhost:3001`

首次启动前请在 `.env.api` 设置强密码（至少 12 位）与强 `JWT_SECRET`（至少 32 位随机字符）。

默认管理员用户名（可在 `.env.api` 修改）：

- 用户名：`admin`

## API 说明

- 默认通过 Vite 代理将 `/api` 转发到 `http://localhost:3001`
- 如需自定义后端地址，可配置 `.env`:

数据库结构文档：`数据库结构说明.md`

```dotenv
VITE_API_BASE=http://localhost:3001/api
VITE_AUTO_LOGOUT_MINUTES=60
```

`VITE_AUTO_LOGOUT_MINUTES` 为后台空闲自动登出分钟数（默认 60 分钟）。

## Windows 开机自动启动

已提供脚本：

- `scripts/start-services.ps1`：自动停止 3001/3002 旧进程并启动 API + 前端预览
- `scripts/stop-services.ps1`：停止 3001/3002 服务

注册开机自启动任务（管理员 PowerShell）：

```powershell
$taskName='JiyunAdminAutoStart'
$scriptPath='C:\Users\Administrator\集运系统\ADMIN\scripts\start-services.ps1'
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
$trigger=New-ScheduledTaskTrigger -AtStartup
$principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force
```

常用维护命令：

```powershell
# 立即触发自启动任务
Start-ScheduledTask -TaskName 'JiyunAdminAutoStart'

# 查看任务状态
Get-ScheduledTask -TaskName 'JiyunAdminAutoStart'
Get-ScheduledTaskInfo -TaskName 'JiyunAdminAutoStart'

# 删除任务
Unregister-ScheduledTask -TaskName 'JiyunAdminAutoStart' -Confirm:$false
```

日志目录：`logs/`

- `logs/autostart.log`
- `logs/api.out.log`、`logs/api.err.log`
- `logs/web.out.log`、`logs/web.err.log`

## GitHub 自动部署（Windows 自托管 Runner）

仓库已提供工作流：`.github/workflows/deploy-production-windows.yml`。

使用方式：

1. 在生产服务器安装并注册 GitHub self-hosted runner（Windows）。
2. 在 GitHub 仓库 `Settings -> Secrets and variables -> Actions` 添加 Secrets：
	- `PROD_ENV_API`（必填）：完整 `.env.api` 文件内容
	- `PROD_ENV_WEB`（可选）：完整 `.env` 文件内容
3. 推送到 `main` 分支，或手动触发 `Deploy Production (Windows)` 工作流。

工作流执行内容：

1. 检出代码
2. 写入 `.env.api`/`.env`
3. 执行 `npm ci`
4. 执行 `scripts/start-services.ps1`（构建并拉起 3001/3002）
5. 进行本机健康检查

说明：

- `.env`、`.env.api` 已被 `.gitignore` 忽略，不会提交到仓库。
- 建议生产服务器仅对外开放网关端口（如 443），3001/3002 仅内网或本机可访问。
