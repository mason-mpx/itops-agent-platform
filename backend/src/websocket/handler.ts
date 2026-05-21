import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../utils/env';
import { logger } from '../utils/logger';
import db from '../models/database';

const taskRooms = new Map<string, Set<string>>();

// WebSocket 认证中间件
function authenticateSocket(socket: Socket, next: any) {
  const token = socket.handshake.auth?.token || 
                socket.handshake.headers?.authorization?.replace('Bearer ', '');

  if (!token) {
    logger.error('❌ WebSocket 认证失败: 未提供 token');
    return next(new Error('未提供认证token'));
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as any;
    
    // 验证用户是否存在且启用
    const user = db.prepare('SELECT id, username, email, role, enabled FROM users WHERE id = ?').get(decoded.id) as any;
    
    if (!user || !user.enabled) {
      logger.error('❌ WebSocket 认证失败: 用户不存在或已禁用');
      return next(new Error('用户不存在或已禁用'));
    }

    // 将用户信息附加到 socket 对象
    (socket as any).user = user;
    logger.info(`✅ WebSocket 认证成功: ${user.username}`);
    next();
  } catch (error) {
    logger.error('❌ WebSocket 认证失败:', error);
    return next(new Error('无效的token'));
  }
}

export function setupWebSocket(io: SocketIOServer) {
  // 应用认证中间件
  io.use(authenticateSocket);

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user;
    logger.info(`🔌 Client connected: ${socket.id} (User: ${user?.username})`);

    socket.on('task:subscribe', (taskId: string) => {
      socket.join(`task:${taskId}`);
      if (!taskRooms.has(taskId)) {
        taskRooms.set(taskId, new Set());
      }
      taskRooms.get(taskId)!.add(socket.id);
      logger.info(`📡 Client ${socket.id} subscribed to task ${taskId}`);
    });

    socket.on('task:unsubscribe', (taskId: string) => {
      socket.leave(`task:${taskId}`);
      taskRooms.get(taskId)?.delete(socket.id);
      logger.info(`📤 Client ${socket.id} unsubscribed from task ${taskId}`);
    });

    socket.on('alert:subscribe', () => {
      socket.join('alerts');
      logger.info(`🔔 Client ${socket.id} subscribed to alerts`);
    });

    socket.on('disconnect', () => {
      logger.info(`❌ Client disconnected: ${socket.id}`);
      taskRooms.forEach((sockets) => {
        sockets.delete(socket.id);
      });
    });
  });
}

export function emitToTask(io: SocketIOServer, taskId: string, event: string, data: any) {
  io.to(`task:${taskId}`).emit(event, { taskId, ...data });
}

export function emitToAlerts(io: SocketIOServer, event: string, data: any) {
  io.to('alerts').emit(event, data);
}

export function broadcast(io: SocketIOServer, event: string, data: any) {
  io.emit(event, data);
}
