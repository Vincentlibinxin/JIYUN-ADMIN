# 集运系统后台管理（WEB）

独立后台管理前端项目，已从 `集运系统APP` 分离。

## 运行方式

```bash
npm install
npm run dev
```

默认地址：`http://localhost:3002`

## API 说明

- 默认通过 Vite 代理将 `/api` 转发到 `http://localhost:3001`
- 如需自定义后端地址，可配置 `.env`:

```dotenv
VITE_API_BASE=http://localhost:3001/api
```
