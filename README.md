# 集运系统后台管理（WEB）

独立后台管理前端项目，API 服务现已可在本目录内独立启动。

## 运行方式

```bash
npm install
npm run dev
```

默认地址：`http://localhost:3002`

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

```dotenv
VITE_API_BASE=http://localhost:3001/api
```
