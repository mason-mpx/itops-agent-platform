import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from '../models/database';
import { env } from '../utils/env';
import { tokenBlacklist } from '../services/tokenBlacklist';

const userCache = new Map<string, { user: any; expiresAt: number }>();
const USER_CACHE_TTL = 60 * 1000;

function getCachedUser(userId: string): any | null {
  const cached = userCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }
  if (cached) {
    userCache.delete(userId);
  }
  return null;
}

function setCachedUser(userId: string, user: any): void {
  userCache.set(userId, { user, expiresAt: Date.now() + USER_CACHE_TTL });
  if (userCache.size > 1000) {
    const oldestKey = userCache.keys().next().value;
    if (oldestKey) {
      userCache.delete(oldestKey);
    }
  }
}

export function clearUserCache(userId?: string): void {
  if (userId) {
    userCache.delete(userId);
  } else {
    userCache.clear();
  }
}

// JWT认证中间件
export function authenticateToken(req: Request & { user?: any }, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: '未提供认证token'
    });
  }

  const token = authHeader.substring(7);

  // 检查token是否在黑名单中
  if (tokenBlacklist.isBlacklisted(token)) {
    return res.status(401).json({
      success: false,
      message: 'Token已失效'
    });
  }

  try {
    const decoded = (jwt.verify as any)(token, env.JWT_SECRET) as any;
    
    let user = getCachedUser(decoded.id);
    if (!user) {
      user = db.prepare('SELECT id, username, email, role, enabled FROM users WHERE id = ?').get(decoded.id) as any;
      if (user) {
        setCachedUser(decoded.id, user);
      }
    }
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户不存在'
      });
    }

    if (!user.enabled) {
      return res.status(403).json({
        success: false,
        message: '账户已被禁用'
      });
    }

    // 将用户信息附加到请求对象
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        success: false,
        message: 'Token已过期'
      });
    }
    return res.status(401).json({
      success: false,
      message: '无效的token'
    });
  }
}

// 角色认证中间件
export function requireRole(...allowedRoles: string[]) {
  return (req: Request & { user?: any }, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '未认证'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: '权限不足'
      });
    }

    next();
  };
}
