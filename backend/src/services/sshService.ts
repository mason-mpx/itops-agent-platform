import { Client } from 'ssh2';
import db from '../models/database';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';
import { decrypt } from './encryptionService';
import { generateCompletion } from './llmService';

interface ServerInfo {
  id: string;
  hostname: string;
  port: number;
  username: string;
  password?: string;
  private_key?: string;
  use_ssh_key: number;
}

export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  command: string;
  duration: number;
  error?: string;
  aiAnalysis?: string;
}

// 默认超时时间（毫秒）
const DEFAULT_CONNECT_TIMEOUT = 10000;
const DEFAULT_COMMAND_TIMEOUT = 30000;

// 预定义的合规检查
const complianceCheckList = [
  { name: 'CPU Usage', command: 'top -bn1 | head -20' },
  { name: 'Memory Usage', command: 'free -h && cat /proc/meminfo | head -20' },
  { name: 'Disk Usage', command: 'df -h && du -sh /* 2>/dev/null | sort -rh | head -20' },
  { name: 'Network Info', command: 'ip addr && netstat -tulpn 2>/dev/null || ss -tulpn' },
  { name: 'User List', command: 'cat /etc/passwd | cut -d: -f1,3,6,7' },
  { name: 'Running Services', command: 'systemctl list-units --type=service --state=running 2>/dev/null || service --status-all 2>&1 | grep "+"' },
  { name: 'Uptime', command: 'uptime && w' },
  { name: 'OS Info', command: 'cat /etc/os-release && uname -a' },
  { name: 'SSH Config', command: 'cat /etc/ssh/sshd_config 2>/dev/null || echo "No SSH config found"' },
  { name: 'Firewall Status', command: 'iptables -L -n 2>/dev/null || ufw status 2>/dev/null || echo "No firewall info"' },
  { name: 'Last Logins', command: 'last -20' },
  { name: 'Cron Jobs', command: 'crontab -l 2>/dev/null || echo "No cron jobs" && ls -la /etc/cron.* 2>/dev/null' },
  { name: 'Package Updates', command: 'apt list --upgradable 2>/dev/null | head -30 || yum check-update 2>/dev/null | head -30 || echo "No package manager found"' }
];

export { complianceCheckList as complianceChecks };

// 记录命令历史
function logCommandHistory(
  serverId: string,
  command: string,
  result: CommandResult,
  executedBy: string = 'system'
): void {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO server_command_history 
    (id, server_id, command, stdout, stderr, success, execution_time_ms, executed_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    serverId,
    command,
    result.stdout,
    result.stderr,
    result.success ? 1 : 0,
    result.duration,
    executedBy
  );
}

// 更新服务器最后连接时间
function updateLastConnected(serverId: string): void {
  db.prepare('UPDATE servers SET last_connected = CURRENT_TIMESTAMP WHERE id = ?').run(serverId);
}

export async function executeCommand(
  serverId: string,
  command: string,
  options: {
    timeout?: number;
    logHistory?: boolean;
    executedBy?: string;
  } = {}
): Promise<CommandResult> {
  const startTime = Date.now();
  const timeout = options.timeout || DEFAULT_COMMAND_TIMEOUT;
  const logHistory = options.logHistory !== false;
  
  try {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as ServerInfo;
    if (!server) {
      throw new Error('Server not found');
    }

    // 解密敏感信息
    const decryptedPassword = server.password ? decrypt(server.password) : undefined;
    const decryptedPrivateKey = server.private_key ? decrypt(server.private_key) : undefined;

    return new Promise((resolve) => {
      const conn = new Client();
      let commandTimeout: NodeJS.Timeout | null = null;
      
      const cleanup = () => {
        if (commandTimeout) {
          clearTimeout(commandTimeout);
          commandTimeout = null;
        }
      };

      const handleResult = (result: CommandResult) => {
        cleanup();
        
        // 记录历史
        if (logHistory) {
          logCommandHistory(serverId, command, result, options.executedBy || 'system');
        }
        
        // 更新最后连接时间
        if (result.success) {
          updateLastConnected(serverId);
        }
        
        resolve(result);
      };

      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            handleResult({
              success: false,
              stdout: '',
              stderr: err.message,
              command,
              duration: Date.now() - startTime
            });
            return;
          }

          let stdout = '';
          let stderr = '';

          // 设置命令超时
          commandTimeout = setTimeout(() => {
            stream.destroy();
            handleResult({
              success: false,
              stdout: '',
              stderr: 'Command timeout',
              command,
              duration: Date.now() - startTime
            });
          }, timeout);

          stream.on('close', (code: number | null) => {
            conn.end();
            handleResult({
              success: code === 0,
              stdout,
              stderr,
              command,
              duration: Date.now() - startTime
            });
          }).on('data', (data: Buffer) => {
            stdout += data.toString();
          }).stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          }).on('error', (err) => {
            stderr += `Stream error: ${err.message}\n`;
          });
        });
      }).on('error', (err) => {
        handleResult({
          success: false,
          stdout: '',
          stderr: err.message,
          command,
          duration: Date.now() - startTime
        });
      }).on('timeout', () => {
        handleResult({
          success: false,
          stdout: '',
          stderr: 'Connection timeout',
          command,
          duration: Date.now() - startTime
        });
      });

      const connectConfig: any = {
        host: server.hostname,
        port: server.port || 22,
        username: server.username,
        readyTimeout: DEFAULT_CONNECT_TIMEOUT,
        keepaliveInterval: 10000,
        keepaliveCountMax: 3,
        maxTries: 1
      };

      if (server.use_ssh_key && decryptedPrivateKey) {
        connectConfig.privateKey = decryptedPrivateKey;
      } else if (decryptedPassword) {
        connectConfig.password = decryptedPassword;
      } else {
        handleResult({
          success: false,
          stdout: '',
          stderr: 'No authentication method configured',
          command,
          duration: Date.now() - startTime
        });
        return;
      }

      conn.connect(connectConfig);
    });
  } catch (error) {
    const result: CommandResult = {
      success: false,
      stdout: '',
      stderr: error instanceof Error ? error.message : 'Unknown error',
      command,
      duration: Date.now() - startTime
    };
    
    if (logHistory) {
      logCommandHistory(serverId, command, result, options.executedBy || 'system');
    }
    
    return result;
  }
}

export async function testConnection(serverId: string): Promise<{ success: boolean; message: string }> {
  const result = await executeCommand(serverId, 'echo "Connection test successful"', { logHistory: false });
  return {
    success: result.success,
    message: result.success ? 'Connection successful' : result.stderr
  };
}

// AI 分析合规检查结果
async function analyzeComplianceCheck(checkName: string, result: CommandResult): Promise<string> {
  try {
    const prompt = `作为一个专业的服务器运维专家，请分析以下合规检查结果，并给出专业的评估和建议：

检查项目：${checkName}
执行命令：${result.command}
执行状态：${result.success ? '成功' : '失败'}

标准输出：
\`\`\`
${result.stdout.substring(0, 2000)}
\`\`\`

错误输出：
\`\`\`
${result.stderr.substring(0, 1000)}
\`\`\`

请用简洁、专业的语言分析：
1. 这项检查的结果说明了什么？
2. 是否存在需要关注的问题或风险？
3. 如果有问题，给出具体的改进建议。

请用中文回答，控制在 300 字以内。`;

    const analysis = await generateCompletion(prompt, '你是一个专业的服务器运维专家，擅长分析系统状态和提供优化建议。', 0.7);
    return analysis;
  } catch (error) {
    return 'AI 分析暂不可用，请查看原始输出。';
  }
}

export async function runComplianceCheck(
  serverId: string,
  options: {
    saveResults?: boolean;
    useAI?: boolean;
  } = {}
): Promise<Record<string, CommandResult>> {
  const checkId = randomUUID();
  const results: Record<string, CommandResult> = {};
  const useAI = options.useAI !== false;
  
  // 创建检查记录
  if (options.saveResults) {
    db.prepare(`
      INSERT INTO compliance_checks 
      (id, server_id, check_name, check_results, status, started_at)
      VALUES (?, ?, 'Full Compliance Check', '[]', 'running', CURRENT_TIMESTAMP)
    `).run(checkId, serverId);
  }
  
  // 执行所有检查并分析
  for (const check of complianceCheckList) {
    const result = await executeCommand(serverId, check.command, {
      logHistory: false,
      executedBy: 'compliance-check'
    });
    
    // 如果启用 AI 分析，则添加分析结果
    if (useAI) {
      result.aiAnalysis = await analyzeComplianceCheck(check.name, result);
    }
    
    results[check.name] = result;
  }
  
  // 保存结果
  if (options.saveResults) {
    db.prepare(`
      UPDATE compliance_checks 
      SET check_results = ?, status = 'completed', completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(results), checkId);
  }
  
  return results;
}

// 获取合规检查历史
export function getComplianceHistory(serverId: string, limit: number = 20): any[] {
  return db.prepare(`
    SELECT * FROM compliance_checks 
    WHERE server_id = ? 
    ORDER BY created_at DESC 
    LIMIT ?
  `).all(serverId, limit);
}

// 获取命令历史
export function getCommandHistory(serverId: string, limit: number = 50): any[] {
  return db.prepare(`
    SELECT * FROM server_command_history 
    WHERE server_id = ? 
    ORDER BY executed_at DESC 
    LIMIT ?
  `).all(serverId, limit);
}
