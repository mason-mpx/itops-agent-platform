# 部署指南

本文档详细介绍企业IT运维多Agent自动化平台的部署方法。

## 📋 前置要求

### 硬件要求
- CPU: 2核以上
- 内存: 4GB以上
- 磁盘: 20GB以上可用空间

### 软件要求
- Docker: 20.10.0+
- Docker Compose: 2.0.0+
- （或本地开发）Node.js: 18.0.0+

## 🐳 Docker部署（推荐）

### 1. 克隆项目
```bash
git clone <repository-url>
cd itops-agent-platform
```

### 2. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，配置必要的参数
```

关键配置项：
```env
NODE_ENV=production
PORT=3001
JWT_SECRET=your-jwt-secret-here
DOUBAO_API_KEY=your-doubao-api-key
```

### 3. 构建并启动
```bash
docker-compose up -d --build
```

### 4. 查看服务状态
```bash
docker-compose ps
```

### 5. 查看日志
```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f backend
docker-compose logs -f frontend
```

### 6. 访问应用
- 前端界面: http://localhost:8080
- 后端API: http://localhost:3001
- 健康检查: http://localhost:3001/health

### 7. 停止服务
```bash
docker-compose down

# 停止并删除数据卷（慎用！）
docker-compose down -v
```

## 💻 本地开发部署

### 1. 安装依赖
```bash
# 使用根目录脚本
npm run install:all

# 或分别安装
cd backend
npm install

cd ../frontend
npm install
```

### 2. 配置环境变量
```bash
cd backend
cp .env.example .env
# 编辑 .env 文件
```

### 3. 启动后端
```bash
cd backend
npm run dev
```

### 4. 启动前端（新终端）
```bash
cd frontend
npm run dev
```

### 5. 访问
- 前端: http://localhost:8080
- 后端: http://localhost:3001

## 🔧 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 | 必填 |
|--------|------|--------|------|
| NODE_ENV | 运行环境 | production | 否 |
| PORT | 后端端口 | 3001 | 否 |
| DATABASE_PATH | 数据库路径 | ./data/app.db | 否 |
| JWT_SECRET | JWT密钥 | 开发环境自动生成 | 是（生产） |
| DOUBAO_API_KEY | 豆包API密钥 | - | 否 |
| DOUBAO_API_BASE | 豆包API地址 | https://ark.cn-beijing.volces.com/api/v3 | 否 |
| DOUBAO_MODEL | 豆包模型 | doubao-4o | 否 |
| OPENAI_API_KEY | OpenAI API密钥 | - | 否 |
| OPENAI_API_BASE | OpenAI API地址 | https://api.openai.com/v1 | 否 |
| OPENAI_MODEL | OpenAI模型 | gpt-4o | 否 |
| ALLOWED_ORIGINS | CORS允许源 | http://localhost:80,http://localhost:3000,http://localhost:8080 | 否 |

### 端口配置

| 端口 | 服务 | 说明 |
|------|------|------|
| 8080 | 前端 | Nginx代理 |
| 3001 | 后端API | Express服务 |

## 🗄️ 数据持久化

### Docker数据卷
数据存储在Docker volume中：
- `app-data`: 存储SQLite数据库文件

### 备份数据
```bash
# 1. 停止服务
docker-compose down

# 2. 备份数据卷
docker run --rm -v itops-agent-platform_app-data:/data -v $(pwd):/backup alpine tar czf /backup/itops-data-backup.tar.gz -C /data .

# 3. 重启服务
docker-compose up -d
```

### 恢复数据
```bash
# 1. 停止服务
docker-compose down

# 2. 恢复数据卷
docker run --rm -v itops-agent-platform_app-data:/data -v $(pwd):/backup alpine tar xzf /backup/itops-data-backup.tar.gz -C /data

# 3. 重启服务
docker-compose up -d
```

## 🔒 安全配置

### 1. 修改默认密码
首次登录后立即修改默认密码：
- admin / admin123
- operator / operator123
- viewer / viewer123

### 2. 配置HTTPS
建议在生产环境使用HTTPS：

```nginx
# 在 docker/nginx.conf 中添加SSL配置
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # ... 其他配置
}
```

### 3. 防火墙配置
只开放必要的端口：
- 80/443 (HTTP/HTTPS)
- 不直接开放3001端口（通过Nginx代理）

### 4. 定期备份
设置定时任务定期备份数据库。

## 📊 监控和日志

### 查看容器状态
```bash
docker-compose ps
```

### 查看日志
```bash
# 实时日志
docker-compose logs -f

# 最近100行
docker-compose logs --tail=100
```

### 资源使用
```bash
docker stats
```

## 🔄 更新部署

### 1. 拉取最新代码
```bash
git pull
```

### 2. 重新构建并启动
```bash
docker-compose up -d --build
```

### 3. 数据库迁移
系统会自动处理数据库迁移，无需手动操作。

## 🐛 故障排查

### 容器无法启动
```bash
# 查看日志
docker-compose logs backend

# 检查端口占用
netstat -tulpn | grep -E ':(3001|8080)'
```

### 数据库问题
```bash
# 检查数据卷
docker volume ls

# 删除旧数据卷（会丢失数据！）
docker volume rm itops-agent-platform_app-data
```

### WebSocket连接失败
- 检查防火墙设置
- 确认ALLOWED_ORIGINS配置正确
- 检查Nginx的WebSocket配置

### SSH连接失败
- 确认目标服务器SSH服务运行
- 检查网络连通性
- 验证认证信息
- 查看后端日志

## 🌐 生产环境建议

### 1. 使用反向代理
使用Nginx或Traefik作为反向代理，处理SSL和负载均衡。

### 2. 数据库备份策略
- 每日自动备份
- 保留最近30天的备份
- 异地存储备份

### 3. 日志管理
- 使用ELK Stack或Loki聚合日志
- 设置日志轮转
- 监控错误日志

### 4. 监控告警
- 监控服务健康状态
- 监控资源使用情况
- 设置告警通知

### 5. 高可用
- 多实例部署
- 负载均衡
- 数据库主从复制

## 📞 下一步

部署完成后：
1. 登录系统并修改默认密码
2. 添加您的服务器
3. 配置通知渠道
4. 设置告警自动处理规则
5. 参考 [项目 README](../README.md) 了解更多功能
