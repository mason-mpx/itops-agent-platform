import db from '../models/database';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';

const blacklistedTokenCache = new Set<string>();

class TokenBlacklistService {
  addToBlacklist(token: string, reason?: string, userId?: string): void {
    try {
      const decoded = jwt.decode(token) as any;
      let expiresAt: Date;
      
      if (decoded && decoded.exp) {
        expiresAt = new Date(decoded.exp * 1000);
      } else {
        expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      }
      
      blacklistedTokenCache.add(token);
      
      db.prepare(`
        INSERT OR IGNORE INTO token_blacklist (id, token, user_id, reason, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        token,
        userId || null,
        reason || null,
        expiresAt.toISOString()
      );
    } catch (error) {
      logger.error('Failed to add token to blacklist:', error);
    }
  }

  isBlacklisted(token: string): boolean {
    if (blacklistedTokenCache.has(token)) {
      return true;
    }
    
    try {
      const result = db.prepare(`
        SELECT 1 FROM token_blacklist 
        WHERE token = ? AND expires_at > CURRENT_TIMESTAMP
      `).get(token);
      
      const isBlacklisted = !!result;
      if (isBlacklisted) {
        blacklistedTokenCache.add(token);
      }
      
      return isBlacklisted;
    } catch (error) {
      logger.error('Failed to check token blacklist:', error);
      return false;
    }
  }

  cleanExpiredTokens(): void {
    try {
      const result = db.prepare(`
        DELETE FROM token_blacklist 
        WHERE expires_at < CURRENT_TIMESTAMP
      `).run();
      
      blacklistedTokenCache.clear();
      
      logger.info(`Cleaned up ${result.changes} expired tokens from blacklist`);
    } catch (error) {
      logger.error('Failed to clean expired tokens:', error);
    }
  }
}

// 导出单例
export const tokenBlacklist = new TokenBlacklistService();

// 启动时清理过期token，并定期清理
export function initTokenBlacklist(): void {
  tokenBlacklist.cleanExpiredTokens();
  
  // 每小时清理一次过期token
  setInterval(() => {
    tokenBlacklist.cleanExpiredTokens();
  }, 60 * 60 * 1000);
}
