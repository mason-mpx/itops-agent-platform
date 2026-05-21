import db from '../models/database';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';

interface AlertNoiseRecord {
  id: string;
  alert_fingerprint: string;
  alert_source: string;
  alert_title: string;
  occurrence_count: number;
  first_occurrence: Date;
  last_occurrence: Date;
  is_suppressed: boolean;
  suppression_reason?: string;
  suppression_until?: Date;
}

class AlertNoiseReductionService {
  // 计算告警指纹（用于去重）
  generateFingerprint(source: string, title: string, _content?: string): string {
    // 简化版指纹：源 + 标题（去除数字和特殊字符）
    const normalizedTitle = title.toLowerCase().replace(/[\d\s_-]+/g, ' ').trim();
    const normalizedSource = source.toLowerCase();
    const fingerprint = `${normalizedSource}:${normalizedTitle}`;
    return require('crypto')
      .createHash('md5')
      .update(fingerprint)
      .digest('hex');
  }

  // 处理新告警，检查是否需要降噪
  async processAlert(
    source: string,
    title: string,
    content?: string,
    severity?: string
  ): Promise<{
    shouldNotify: boolean;
    isDuplicate: boolean;
    suppressionReason?: string;
    occurrenceCount: number;
  }> {
    const fingerprint = this.generateFingerprint(source, title, content);
    const now = new Date();

    // 查询是否已存在此指纹的告警
    const existing = db.prepare(
      'SELECT * FROM alert_noise_reduction WHERE alert_fingerprint = ?'
    ).get(fingerprint) as AlertNoiseRecord | null;

    if (existing) {
      // 检查是否已被抑制
      const isSuppressed = existing.is_suppressed && 
        (!existing.suppression_until || new Date(existing.suppression_until) > now);

      // 更新出现次数
      const newCount = existing.occurrence_count + 1;
      db.prepare(`
        UPDATE alert_noise_reduction 
        SET occurrence_count = ?, last_occurrence = ? 
        WHERE alert_fingerprint = ?
      `).run(newCount, now.toISOString(), fingerprint);

      // 判断是否需要抑制
      const shouldSuppress = this.shouldSuppressAlert(existing, severity);

      if (shouldSuppress && !isSuppressed) {
        db.prepare(`
          UPDATE alert_noise_reduction 
          SET is_suppressed = 1, 
              suppression_reason = ?,
              suppression_until = ?
          WHERE alert_fingerprint = ?
        `).run(
          '频繁告警自动抑制',
          new Date(now.getTime() + 30 * 60 * 1000).toISOString(), // 30分钟
          fingerprint
        );
      }

      return {
        shouldNotify: !isSuppressed && !shouldSuppress,
        isDuplicate: true,
        suppressionReason: isSuppressed ? existing.suppression_reason : undefined,
        occurrenceCount: newCount
      };
    } else {
      // 首次出现，创建记录
      db.prepare(`
        INSERT INTO alert_noise_reduction 
        (id, alert_fingerprint, alert_source, alert_title, occurrence_count, first_occurrence, last_occurrence)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        fingerprint,
        source,
        title,
        1,
        now.toISOString(),
        now.toISOString()
      );

      return {
        shouldNotify: true,
        isDuplicate: false,
        occurrenceCount: 1
      };
    }
  }

  // 判断是否需要抑制告警
  private shouldSuppressAlert(record: AlertNoiseRecord, severity?: string): boolean {
    // 严重和高优先级告警不抑制
    if (severity === 'critical' || severity === 'high') {
      return false;
    }

    // 低级别告警，如果出现次数过多则抑制
    const suppressionThreshold = 5; // 5次以上
    return record.occurrence_count >= suppressionThreshold;
  }

  // 获取告警降噪统计
  getNoiseReductionStats(): {
    totalAlerts: number;
    suppressedAlerts: number;
    duplicateCount: number;
    noiseReductionRate: number;
  } {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_suppressed = 1 THEN 1 ELSE 0 END) as suppressed,
        SUM(occurrence_count - 1) as duplicates
      FROM alert_noise_reduction
    `).get() as any;

    const total = stats?.total || 0;
    const suppressed = stats?.suppressed || 0;
    const duplicates = stats?.duplicates || 0;
    const noiseReductionRate = total > 0 ? Math.round(((suppressed + duplicates) / (total + duplicates)) * 100) : 0;

    return {
      totalAlerts: total,
      suppressedAlerts: suppressed,
      duplicateCount: duplicates,
      noiseReductionRate
    };
  }

  // 获取被抑制的告警列表
  getSuppressedAlerts(): AlertNoiseRecord[] {
    const records = db.prepare(`
      SELECT * FROM alert_noise_reduction 
      WHERE is_suppressed = 1 
      ORDER BY last_occurrence DESC 
      LIMIT 50
    `).all() as any[];

    return records.map(r => ({
      ...r,
      first_occurrence: new Date(r.first_occurrence),
      last_occurrence: new Date(r.last_occurrence),
      suppression_until: r.suppression_until ? new Date(r.suppression_until) : undefined
    }));
  }

  // 恢复被抑制的告警
  unsuppressAlert(fingerprint: string): boolean {
    const result = db.prepare(`
      UPDATE alert_noise_reduction 
      SET is_suppressed = 0, suppression_reason = NULL, suppression_until = NULL 
      WHERE alert_fingerprint = ?
    `).run(fingerprint);

    return result.changes > 0;
  }

  // 清理旧的降噪记录
  cleanupOldRecords(daysToKeep: number = 30): number {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    const result = db.prepare(`
      DELETE FROM alert_noise_reduction 
      WHERE last_occurrence < ?
    `).run(cutoffDate.toISOString());

    return result.changes;
  }

  // 手动抑制告警
  manuallySuppressAlert(
    fingerprint: string,
    reason: string,
    durationMinutes: number = 60
  ): boolean {
    const now = new Date();
    const suppressionUntil = new Date(now.getTime() + durationMinutes * 60 * 1000);

    const result = db.prepare(`
      UPDATE alert_noise_reduction 
      SET is_suppressed = 1, suppression_reason = ?, suppression_until = ? 
      WHERE alert_fingerprint = ?
    `).run(reason, suppressionUntil.toISOString(), fingerprint);

    return result.changes > 0;
  }
}

export const alertNoiseReductionService = new AlertNoiseReductionService();
