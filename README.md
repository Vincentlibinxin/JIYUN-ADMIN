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

默认管理员账号（首次自动初始化）：

- 用户名：`admin`
- 密码：`Admin123456`

## API 说明

- 默认通过 Vite 代理将 `/api` 转发到 `http://localhost:3001`
- 如需自定义后端地址，可配置 `.env`:

```dotenv
VITE_API_BASE=http://localhost:3001/api
```
