# ITOPS Agent Platform - 部署操作手册

## 项目概述

ITOps Agent Platform 是一个基于 AI 的智能运维平台，采用前后端分离架构：

| 模块 | 技术栈 | 端口 | 说明 |
|------|--------|------|------|
| 后端 | Node.js 20 + Express + TypeScript + SQLite | 3001 | REST API + WebSocket |
| 前端 | React + TypeScript + Vite + TailwindCSS | 80 (Nginx) | SPA 单页应用 |
| 反向代理 | Nginx (Alpine) | 8080 → 80 | 前端静态文件 + /api 代理 |

---

## 1. 环境要求

| 工具 | 最低版本 | 说明 |
|------|---------|------|
| Docker | 20.10+ | 容器运行时 |
| Docker Compose | v2.0+ | 编排工具 (或 `docker compose` v2) |
| Git | 2.0+ | 源码管理（可选） |

> **注意**: Windows/macOS 用户安装 Docker Desktop 即可（已包含 Docker + Compose）。Linux 用户需单独安装 docker-compose-plugin。

---

## 2. 快速部署（5 分钟）

### 2.1 克隆项目

```bash
git clone <your-repo-url>
cd ai
```

### 2.2 配置环境变量

项目根目录的 `.env` 文件会被 Docker Compose 自动读取。**请务必修改 JWT_SECRET**：

```bash
# 复制示例文件（如果没有 .env）
cp .env.example .env
```

编辑 `.env`，重点配置：

```env
# 【必须修改】生产环境使用强随机密钥
JWT_SECRET=your-production-secret-change-me

# 【可选】AI 模型配置，部署后也可在网页设置页面配置
DOUBAO_API_KEY=
DOUBAO_API_BASE=https://ark.cn-beijing.volces.com/api/v3
DOUBAO_MODEL=doubao-4o
OPENAI_API_KEY=
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o
```

### 2.3 一键启动（简化版，推荐首次使用）

```bash
docker compose -f docker-compose.simple.yml up -d --build
```

### 2.4 验证部署

```bash
# 查看容器状态（两个都应显示 Up）
docker compose -f docker-compose.simple.yml ps

# 检查后端健康
curl http://localhost:3001/health
# 预期输出: {"status":"ok","timestamp":"..."}

# 前端页面
# 浏览器打开: http://localhost:8080
```

### 2.5 登录系统

```
地址: http://localhost:8080
用户名: admin
密码: admin123
```

---

## 3. 生产级部署

### 3.1 使用生产版 Compose 文件

生产版 `docker-compose.yml` 相比简化版额外提供：

| 特性 | 简化版 | 生产版 |
|------|--------|--------|
| 多阶段构建（镜像体积更小） | ❌ | ✅ |
| 健康检查 | ❌ | ✅ |
| 资源限制（CPU/内存） | ❌ | ✅ |
| 自定义网络隔离 | ❌ | ✅ |
| 完整环境变量注入 | ❌ | ✅ |

```bash
# 构建并启动
docker compose up -d --build

# 仅重新构建（不重启已运行的容器）
docker compose build

# 仅重启
docker compose up -d
```

### 3.2 环境变量完整配置

生产版会自动注入更多环境变量，建议在 `.env` 中完整配置：

```env
NODE_ENV=production
PORT=3001
DATABASE_PATH=/app/data/app.db

JWT_SECRET=your-strong-random-secret-here

# AI 模型（部署后在网页设置也可配置）
DOUBAO_API_KEY=your-doubao-key
DOUBAO_API_BASE=https://ark.cn-beijing.volces.com/api/v3
DOUBAO_MODEL=doubao-4o
OPENAI_API_KEY=your-openai-key
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o

# CORS 白名单（添加你的域名）
ALLOWED_ORIGINS=http://localhost:8080,https://your-domain.com
```

### 3.3 查看日志

```bash
# 实时查看所有服务日志
docker compose logs -f

# 只看后端
docker compose logs -f backend

# 只看前端
docker compose logs -f frontend

# 最近 100 行
docker compose logs --tail=100 backend
```

---

## 4. Dockerfile 选择指南

项目提供 3 套后端 Dockerfile，按需选择：

| Dockerfile | 基础镜像 | 适用场景 | 镜像体积 |
|-----------|---------|---------|---------|
| `Dockerfile.backend` | node:20-slim (多阶段) | **生产环境** | ~300MB |
| `Dockerfile.backend.simple` | node:20 | 测试/演示 | ~1.2GB |
| `Dockerfile.backend.easy` | node:20 | 快速验证 | ~1.2GB |

修改 `docker-compose.yml` 中的 `dockerfile` 字段即可切换：

```yaml
services:
  backend:
    build:
      dockerfile: docker/Dockerfile.backend  # 切换这里
```

---

## 5. 常用运维命令

### 5.1 生命周期管理

```bash
# 启动（使用简化版）
docker compose -f docker-compose.simple.yml up -d

# 停止
docker compose -f docker-compose.simple.yml down

# 重启
docker compose -f docker-compose.simple.yml restart

# 停止并删除数据卷（⚠️ 会清空数据库）
docker compose -f docker-compose.simple.yml down -v
```

### 5.2 进入容器调试

```bash
# 进入后端容器
docker exec -it itops-backend-simple sh

# 进入前端容器
docker exec -it itops-frontend-simple sh

# 查看后端文件
docker exec itops-backend-simple ls -la /app

# 查看数据库文件
docker exec itops-backend-simple ls -la /app/data
```

### 5.3 数据备份

```bash
# 备份 SQLite 数据库
docker cp itops-backend-simple:/app/data/app.db ./backup-$(date +%Y%m%d).db

# 恢复数据库
docker cp ./backup-20260520.db itops-backend-simple:/app/data/app.db
docker compose -f docker-compose.simple.yml restart backend
```

### 5.4 更新部署

```bash
# 拉取最新代码
git pull

# 重新构建并启动
docker compose -f docker-compose.simple.yml up -d --build
```

---

## 6. 项目目录结构

```
ai/
├── docker/                          # Docker 配置文件
│   ├── Dockerfile.backend           # 后端生产版（多阶段构建）
│   ├── Dockerfile.backend.simple    # 后端简化版
│   ├── Dockerfile.backend.easy      # 后端极简版
│   ├── Dockerfile.frontend          # 前端（Node + Nginx 多阶段）
│   └── nginx.conf                   # Nginx 反向代理配置
├── backend/                         # 后端源码
│   ├── src/
│   │   ├── app.ts                   # Express 入口
│   │   ├── routes/                  # API 路由
│   │   ├── models/                  # 数据模型（SQLite）
│   │   ├── services/                # 业务逻辑（Agent 执行器、工作流引擎）
│   │   ├── middleware/              # 中间件（认证、CORS）
│   │   └── utils/                   # 工具（logger、加密、环境变量）
│   ├── package.json
│   └── tsconfig.json
├── frontend/                        # 前端源码
│   ├── src/
│   │   ├── pages/                   # 页面组件
│   │   ├── components/              # UI 组件
│   │   └── lib/                     # 工具库（API 客户端）
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml               # 生产版 Compose 配置
├── docker-compose.simple.yml        # 简化版 Compose 配置
├── .env                             # 环境变量（不提交 Git）
├── .env.example                     # 环境变量模板（可提交 Git）
├── .dockerignore                    # Docker 构建排除文件
└── DEPLOYMENT.md                    # 本文档
```

---

## 7. 架构说明

### 7.1 网络架构

```
用户浏览器
    │
    ▼
┌─────────────────────────┐
│  Nginx (:8080 → :80)    │  前端容器
│  ├── / → 静态文件       │  (ai-frontend)
│  ├── /api → 代理到后端  │
│  └── /socket.io → WS代理│
└──────────┬──────────────┘
           │ Docker 网络
           ▼
┌─────────────────────────┐
│  Express (:3001)        │  后端容器
│  ├── REST API           │  (ai-backend)
│  ├── WebSocket          │
│  └── SQLite DB          │
└─────────────────────────┘
```

### 7.2 数据持久化

- SQLite 数据库文件存储在 Docker Volume `app-data` 中
- 容器重启/重建不会丢失数据
- 数据库路径：`/app/data/app.db`（容器内）
- 只有执行 `docker compose down -v` 才会清除数据

### 7.3 反向代理规则

| 路径 | 目标 | 说明 |
|------|------|------|
| `/` | `/usr/share/nginx/html` | 前端静态文件 (SPA) |
| `/api/*` | `http://backend:3001/api/*` | API 代理 |
| `/socket.io/*` | `http://backend:3001/socket.io/*` | WebSocket 代理 |

---

## 8. 常见问题排查

### 8.1 容器无法启动

```bash
# 查看启动日志
docker compose logs backend

# 常见原因：
# 1. 端口被占用 → 修改 docker-compose.yml 中的端口映射
# 2. 镜像构建失败 → 检查 Dockerfile 和网络连接
# 3. JWT_SECRET 未设置（生产版）→ 检查 .env 文件
```

### 8.2 前端页面空白

1. 确认后端健康检查通过：`curl http://localhost:3001/health`
2. 检查浏览器控制台 Network 面板，看 `/api/` 请求是否 200
3. 如果 API 请求 502，说明 Nginx 连不上后端，检查 `nginx.conf` 中 `proxy_pass` 地址

### 8.3 数据库被锁定

```bash
# 重启后端容器
docker compose restart backend
```

### 8.4 登录失败

1. 确认使用了正确的默认账号：`admin` / `admin123`
2. 如果提示"用户不存在"，可能数据库被清空了，执行：
   ```bash
   docker compose down -v
   docker compose up -d --build
   ```
   ⚠️ 这会清除所有数据！

### 8.5 AI 模型无法调用

1. 部署后在网页 → 设置页面配置 API 密钥
2. 检查 API 密钥是否有效、有余额
3. 查看后端日志确认错误详情：
   ```bash
   docker compose logs backend | grep -i error
   ```

---

## 9. 安全建议

1. **修改 JWT_SECRET**：生产环境必须使用强随机字符串，不要使用默认值
   ```bash
   # 生成随机密钥
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

2. **修改默认密码**：首次登录后立即在设置中修改 admin 密码

3. **配置 CORS**：将 `ALLOWED_ORIGINS` 限制为实际使用的域名

4. **HTTPS**：生产环境建议在 Nginx 前加一层反向代理（如 Nginx Proxy Manager、Traefik）配置 SSL 证书

5. **防火墙**：仅暴露 8080 端口对外，3001 端口应仅内网访问

---

## 10. 附录

### 10.1 支持的 AI 模型

| 平台 | 模型 | 环境变量 |
|------|------|---------|
| 豆包 (火山引擎) | doubao-4o 等 | `DOUBAO_API_KEY` |
| OpenAI | gpt-4o 等 | `OPENAI_API_KEY` |
| 兼容 OpenAI API 的服务 | 任意 | `OPENAI_API_KEY` + `OPENAI_API_BASE` |

### 10.2 Docker 资源清理

```bash
# 清理未使用的镜像
docker image prune -a

# 清理未使用的数据卷（⚠️ 会删除数据）
docker volume prune

# 完全清理
docker system prune -a --volumes
```

### 10.3 版本信息

| 组件 | 版本 |
|------|------|
| Docker 验证版本 | 29.0.1 |
| Docker Compose | v2 |
| Node.js (容器) | 20 |
| Nginx (容器) | Alpine latest |

---

> 📅 最后更新：2026-05-20  
> 📝 本文档基于实际部署验证编写