import { Router, Request, Response } from 'express';
import { db } from '../models/database';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { env } from '../utils/env';
import { tokenBlacklist } from '../services/tokenBlacklist';

const router = Router();

// 登录
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码不能为空'
      });
    }

    // 查询用户
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }

    if (!user.enabled) {
      return res.status(403).json({
        success: false,
        message: '账户已被禁用'
      });
    }

    // 验证密码
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }

    // 生成JWT
    const token = (jwt.sign as any)(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        email: user.email
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    // 更新登录时间
    db.prepare('UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    // 记录审计日志
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      randomUUID(),
      user.id,
      'login',
      'auth',
      'login',
      JSON.stringify({ username }),
      req.ip
    );

    res.json({
      success: true,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

// 获取当前用户信息
router.get('/me', async (req: Request & { user?: any }, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: '未提供认证token'
      });
    }

    const token = authHeader.substring(7);
    const decoded = (jwt.verify as any)(token, env.JWT_SECRET) as any;

    const user = db.prepare('SELECT id, username, email, role, enabled, created_at FROM users WHERE id = ?').get(decoded.id) as any;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户不存在'
      });
    }

    res.json({
      success: true,
      data: user
    });
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
});

// 退出登录
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // 尝试从token中解析用户ID
      let userId: string | undefined;
      try {
        const decoded = jwt.decode(token) as any;
        if (decoded && decoded.id) {
          userId = decoded.id;
        }
      } catch {
        // 忽略解析错误
      }
      
      // 将token加入黑名单
      tokenBlacklist.addToBlacklist(token, 'user-logout', userId);
    }
    
    res.json({
      success: true,
      message: '退出成功'
    });
  } catch (error) {
    // 即使出错也返回成功，避免客户端无法处理
    console.error('Logout error:', error);
    res.json({
      success: true,
      message: '退出成功'
    });
  }
});

export default router;
