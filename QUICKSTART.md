# 快速开始指南

## 系统要求

- Docker 和 Docker Compose（推荐 Docker Desktop）
- 至少 4GB 可用内存
- 至少 10GB 可用磁盘空间

## 快速启动

### Windows 用户

```powershell
.\start.ps1
```

### Linux/Mac 用户

```bash
chmod +x start.sh stop.sh
./start.sh
```

### 手动启动

```bash
cp .env.example .env        # 可选：配置环境变量
docker-compose up -d --build
```

### 简化版启动

```bash
docker-compose -f docker-compose.simple.yml up -d --build
```

## 访问应用

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:8080 |
| 后端 API | http://localhost:3001 |
| 健康检查 | http://localhost:3001/health |

**默认登录**: `admin` / `admin123`

## 配置 AI 模型

系统支持豆包（Doubao）和 OpenAI 两种模型。在「设置 → API 配置」页面配置 API 密钥后即可使用 AI 功能。

## 停止服务

```bash
docker-compose down
```

或使用脚本：

```bash
# Windows
.\stop.ps1

# Linux/Mac
./stop.sh
```

## 查看日志

```bash
docker-compose logs -f
```

## 本地开发

```bash
# 终端 1：启动后端（http://localhost:3001）
cd backend && npm install && npm run dev

# 终端 2：启动前端（http://localhost:5173）
cd frontend && npm install && npm run dev
```

## 常见问题

### 端口被占用

修改 `.env` 或 `docker-compose.yml` 中的端口配置后重启。

### 数据库初始化失败

```bash
mkdir -p data
# Linux/Mac 确保有写入权限
chmod 755 data
```

### SSH 连接失败

- 确认目标服务器 SSH 服务运行中
- 验证用户名/密码/密钥正确
- 检查网络和防火墙配置

### WebSocket 连接失败

确认 `ALLOWED_ORIGINS` 环境变量包含正确的访问地址。