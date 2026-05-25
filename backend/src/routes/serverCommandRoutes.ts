import { Router, Request, Response } from 'express';
import { executeCommand, testConnection, runComplianceCheck, complianceChecks } from '../services/sshService';
import { randomUUID } from 'crypto';
import db from '../models/database';

const router = Router();

// 危险命令模式 - 用于检测潜在危险操�?
const DANGEROUS_PATTERNS = [
  /rm\s+-rf/i,           // 强制递归删除
  /mkfs/i,               // 格式化命�?
  /dd\s+if=/i,           // dd命令
  /:\(\)\s*\{/i,         // fork炸弹
  /chmod\s+777/i,        // 过宽权限
  />\s*\/dev\/sda/i,     // 直接写入磁盘
  /chroot/i,             // chroot
  /su\s+/i,              // 切换用户
  /sudo\s+/i,            // sudo命令
  /passwd/i,             // 密码修改
  /crontab/i,            // cron修改
];

// 验证命令安全�?
function validateCommandSafety(command: string): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  // 检查危险模�?
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      warnings.push(`Command contains potentially dangerous pattern: ${pattern.source}`);
    }
  }
  
  // 检查命令长�?
  if (command.length > 1000) {
    warnings.push('Command is unusually long');
  }
  
  return {
    valid: warnings.length === 0,
    warnings
  };
}

// 记录命令审计日志
function logCommandAudit(
  userId: string, 
  serverId: string, 
  command: string, 
  isSafe: boolean, 
  warnings: string[]
) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      randomUUID(),
      userId,
      'command-execute',
      'server',
      serverId,
      JSON.stringify({ command, isSafe, warnings })
    );
  } catch (error) {
    console.error('Failed to log command audit:', error);
  }
}

// 测试服务器连�?
router.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const result = await testConnection(req.params.id);
    res.json({ success: result.success, data: result });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to test connection' });
  }
});

// 执行单个命令
router.post('/:id/exec', async (req: Request & { user?: { id: string } }, res: Response) => {
  try {
    const { command, timeout } = req.body;
    
    if (!command) {
      return res.status(400).json({ success: false, error: 'Command is required' });
    }
    
    // 验证命令安全�?
    const safetyCheck = validateCommandSafety(command);
    
    // 获取用户ID
    const userId = req.user?.id || 'unknown';
    
    // 记录审计日志
    logCommandAudit(userId, req.params.id, command, safetyCheck.valid, safetyCheck.warnings);
    
    // 如果有安全警告，仍然执行但返回警�?
    const result = await executeCommand(req.params.id, command, { 
      timeout,
      executedBy: userId
    });
    
    res.json({ 
      success: true, 
      data: result,
      warnings: safetyCheck.warnings.length > 0 ? safetyCheck.warnings : undefined
    });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to execute command' });
  }
});

// 获取可用的合规检查列�?
router.get('/compliance/checks', (_req: Request, res: Response) => {
  res.json({ 
    success: true, 
    data: complianceChecks.map(check => ({
      name: check.name,
      command: check.command
    }))
  });
});

// 运行完整的合规检�?
router.post('/:id/compliance', async (req: Request, res: Response) => {
  try {
    const saveResults = req.body.saveResults !== false;
    const results = await runComplianceCheck(req.params.id, { saveResults });
    
    res.json({ success: true, data: results });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to run compliance check' });
  }
});

export default router;
