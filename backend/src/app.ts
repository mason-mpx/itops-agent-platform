import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { initializeDatabase, setIOInstance } from './models/database';
import { setupWebSocket } from './websocket/handler';
import agentRoutes from './routes/agentRoutes';
import workflowRoutes from './routes/workflowRoutes';
import taskRoutes from './routes/taskRoutes';
import alertRoutes from './routes/alertRoutes';
import knowledgeRoutes from './routes/knowledgeRoutes';
import reportRoutes from './routes/reportRoutes';
import settingsRoutes from './routes/settingsRoutes';
import serverRoutes from './routes/serverRoutes';
import serverCommandRoutes from './routes/serverCommandRoutes';
import scriptRoutes from './routes/scriptRoutes';
import auditRoutes from './routes/auditRoutes';
import notificationRoutes from './routes/notificationRoutes';
import webhookRoutes from './routes/webhookRoutes';
import userRoutes from './routes/userRoutes';
import scheduledTaskRoutes from './routes/scheduledTaskRoutes';
import alertMappingRoutes from './routes/alertMappingRoutes';
import notificationConfigRoutes from './routes/notificationConfigRoutes';
import authRoutes from './routes/authRoutes';
import copilotRoutes from './routes/copilotRoutes';
import alertNoiseRoutes from './routes/alertNoiseRoutes';
import rootCauseAnalysisRoutes from './routes/rootCauseAnalysisRoutes';
import multiAgentRoutes from './routes/multiAgentRoutes';
import { schedulerService } from './services/schedulerService';
import { reportService } from './services/reportService';
import { copilotService } from './services/copilotService';
import { rootCauseAnalysisService } from './services/rootCauseAnalysisService';
import { notificationService } from './services/notificationService';
import { errorHandler } from './middleware/errorHandler';
import { authenticateToken } from './middleware/auth';
import { rateLimiter } from './middleware/rateLimiter';
import { env } from './utils/env';
import { logger } from './utils/logger';
import { initTokenBlacklist } from './services/tokenBlacklist';

const app = express();
const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: env.ALLOWED_ORIGINS,
    methods: ['GET', 'POST']
  }
});

app.use(helmet());
app.use(morgan('combined'));
app.use(cors({
  origin: env.ALLOWED_ORIGINS,
  credentials: true
}));

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

initializeDatabase();

// 初始化各个服务
reportService.init();
copilotService.init();
rootCauseAnalysisService.init();
schedulerService.init();
notificationService.init();
initTokenBlacklist();

setupWebSocket(io);
setIOInstance(io);

// 公开路由 - 添加速率限制但不需要认证
app.use('/api/auth', rateLimiter, authRoutes);

// Webhook 路由不需要认证（外部系统推送告警）
app.use('/api/webhooks', rateLimiter, webhookRoutes);

// 健康检查 - 不需要认证
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 以下所有路由都需要认证
app.use(authenticateToken);

// 受保护的路由 - 也应用速率限制
app.use('/api/copilot', rateLimiter, copilotRoutes);
app.use('/api/agents', rateLimiter, agentRoutes);
app.use('/api/workflows', rateLimiter, workflowRoutes);
app.use('/api/tasks', rateLimiter, taskRoutes);
app.use('/api/alerts', rateLimiter, alertRoutes);
app.use('/api/knowledge', rateLimiter, knowledgeRoutes);
app.use('/api/reports', rateLimiter, reportRoutes);
app.use('/api/settings', rateLimiter, settingsRoutes);
app.use('/api/servers', rateLimiter, serverRoutes);
app.use('/api/server-commands', rateLimiter, serverCommandRoutes);
app.use('/api/scripts', rateLimiter, scriptRoutes);
app.use('/api/audit', rateLimiter, auditRoutes);
app.use('/api/notifications', rateLimiter, notificationRoutes);
app.use('/api/users', rateLimiter, userRoutes);
app.use('/api/scheduled-tasks', rateLimiter, scheduledTaskRoutes);
app.use('/api/alert-mappings', rateLimiter, alertMappingRoutes);
app.use('/api/notification-config', rateLimiter, notificationConfigRoutes);
app.use('/api/alert-noise', rateLimiter, alertNoiseRoutes);
app.use('/api/root-cause-analysis', rateLimiter, rootCauseAnalysisRoutes);
app.use('/api/multi-agent', rateLimiter, multiAgentRoutes);

app.use(errorHandler);

const PORT = env.PORT;
const HOST = process.env.HOST || '0.0.0.0';

httpServer.listen(PORT, HOST, () => {
  logger.info(`🚀 ITOps Agent Platform Backend running on ${HOST}:${PORT}`);
  logger.info(`📡 WebSocket server ready`);
  logger.info(`🌍 Environment: ${env.NODE_ENV}`);
});

export { app, io };
