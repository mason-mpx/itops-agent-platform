# 变更日志

所有重要的项目变更都将记录在此文件中。

## [Unreleased]

### 新增功能
- **Web SSH 终端** — 基于 xterm.js 的交互式远程终端
  - 实时双向 WebSocket 通信
  - 窗口大小自适应同步
  - VS Code 暗色主题配色
  - 连接状态可视化（连接中/已连接/错误/断开）
  - 服务器搜索筛选（按名称/IP/用户名/标签）
- **主机管理增强** — 企业级服务器分组与批量运维
  - 多级分组树形结构，支持父子关系
  - 按分组筛选服务器列表
  - JSON 批量导入，自动验证 SSH 连通性
  - 一键采集主机信息（OS/CPU/内存/磁盘/IP）
  - 服务器卡片展示分组标签和硬件信息

### Bug 修复
- 修复 Token 黑名单内存泄漏（Set 改为 Map + TTL 清理）
- 修复 Copilot 对话内存泄漏（添加 7 天 TTL + 1000 条上限）
- 修复加密服务空指针异常（activeKey 可能为 undefined）
- 修复 SSH 连接泄漏（错误路径未调用 conn.end()）
- 修复 WebSocket 监听器泄漏（terminal:data 重复注册）
- 修复 WebTerminal 路由切换黑屏问题（useEffect 依赖 + xterm.js 竞争）
- 修复 Servers 页面 .flatMap() 崩溃（防御性检查 undefined）
- 提取重复的 API 辅助函数到共享模块（getApiKey/getModelId/getApiBase/buildApiEndpoint）
- 修复 JWT 类型断言不规范问题
- 修复 import 语法不统一问题

### 改进
- 终端会话 30 分钟 TTL 自动清理，最大 100 个活跃会话
- 所有内存管理组件均添加上限和定时清理机制
- 前端路由切换时自动清理资源，防止 DOM 竞争
- 批量导入失败时自动清理孤儿数据（servers + group_mapping）

### 文档
- 新建 `WEB_TERMINAL.md` — Web 终端完整技术文档
- 新建 `SERVER_MANAGEMENT.md` — 主机管理增强功能文档
- 新建 `CHANGELOG.md` — 变更日志
- 新建 `TEST_GUIDE.md` — 功能测试说明
- 更新 `README.md` — 新增 Web 终端和主机管理功能说明
- 更新 `docs/README.md` — 新增文档导航条目
- 更新 `docs/ZABBIX_CONFIG.md` — 修复无效文档引用
- 更新 `.env.example` — 补充 JWT_SECRET 配置项
- 删除 `QUICKSTART.md` — 内容已合并到 README
- 删除 `DEPLOY.md` — 与 `DEPLOYMENT.md` 重复

### 代码质量
- 清理后端 database.ts 中的 5 处 DB_INIT DEBUG 调试日志
- 清理后端 settingsRoutes.ts 中的 5 处 DEBUG 调试日志
- 清理前端 Tasks.tsx 中的 10 处 WebSocket 调试日志
- 清理前端 ChatWidget.tsx 中的 4 处对话调试日志
- 清理后端 rootCauseAnalysisService.ts 和 reportService.ts 中的调试日志
- 修复 81 个 ESLint 警告（主要为 `any` 类型和未使用变量）
- 修复 `Math.random()` 在 `useMemo` 中的不稳定使用
- 修复 WorkflowEditor 中 useEffect 内 setState 的问题
- 前后端 TypeScript 编译零错误通过
- 清理 `.FullName` 垃圾文件和根目录重复的 `wechaterweima.png`

### 部署与发布
- 新增 `QUICK_DEPLOY.md` — 面向国内用户的快速部署指南
- 新增 `deploy.sh` — Linux 一键部署脚本（自动检查环境、生成配置、拉取镜像、启动服务、健康检查）
- 推送 Docker 镜像到阿里云杭州镜像仓库
  - 后端: `registry.cn-hangzhou.aliyuncs.com/huluwa666/tsq-images-hub:backend-v3.0.1`
  - 前端: `registry.cn-hangzhou.aliyuncs.com/huluwa666/tsq-images-hub:frontend-v3.0.1`
- 修复 `QUICK_DEPLOY.md` 中 JWT_SECRET 生成逻辑（heredoc 变量展开问题）

### 安全
- 所有 WebSocket 连接均需 JWT 认证
- SSH 密码和密钥 AES-256-GCM 加密存储
- 组件卸载时主动断开 SSH 连接和清理监听器
- 批量导入自动去重，防止重复添加服务器

---

## [3.0.1] — 2026-05-25

### 版本升级
- 版本号从 `v1.0.0` 升级至 `v3.0.1`
- 更新所有 `package.json` 版本号（根目录、frontend、backend）
- 更新 `SPEC.md` 版本号

## [1.0.0] — 2026-05-18

### 初始发布
- 多 Agent 协作平台
- 可视化工作流编排
- 服务器管理（SSH 命令执行/合规检查）
- 告警中心（Prometheus/Zabbix/通用）
- 知识库 + RAG 检索
- AI Copilot 对话式运维
- 定时任务
- 报告系统
- Docker 一键部署
