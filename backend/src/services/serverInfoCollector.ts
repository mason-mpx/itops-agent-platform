import { Client } from 'ssh2';
import db from '../models/database';
import { decrypt } from './encryptionService';
import { logger } from '../utils/logger';

interface ServerInfo {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  password: string | null;
  private_key: string | null;
  use_ssh_key: number;
  enabled: number;
}

interface ServerInfoResult {
  success: boolean;
  error?: string;
  data?: {
    os: string;
    cpu_cores: number;
    memory_gb: number;
    disk_gb: number;
    ip_address: string;
    private_ip: string;
  };
}

class ServerInfoCollector {
  private static readonly CONNECT_TIMEOUT = 10000;

  async collectServerInfo(serverId: string): Promise<ServerInfoResult> {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as ServerInfo | undefined;

    if (!server || !server.enabled) {
      return { success: false, error: 'Server not found or disabled' };
    }

    const decryptedPassword = server.password ? decrypt(server.password) : undefined;
    const decryptedPrivateKey = server.private_key ? decrypt(server.private_key) : undefined;

    return new Promise((resolve) => {
      const conn = new Client();
      let isResolved = false;

      const safeResolve = (result: ServerInfoResult) => {
        if (!isResolved) {
          isResolved = true;
          try {
            conn.end();
          } catch { /* ignore */ }
          resolve(result);
        }
      };

      conn.on('ready', () => {
        const commands = {
          os: "cat /etc/os-release 2>/dev/null | grep '^PRETTY_NAME=' | cut -d'=' -f2 | tr -d '\"'",
          cpu_cores: "nproc 2>/dev/null || grep -c '^processor' /proc/cpuinfo 2>/dev/null || echo 0",
          memory_gb: "free -g 2>/dev/null | awk '/^Mem:/{print $2}' || echo 0",
          disk_gb: "df -BG 2>/dev/null | awk '/^\\//{sum+=$2}END{print int(sum/1024)}' || echo 0",
          ip_address: "hostname -I 2>/dev/null | awk '{print $1}' || echo ''",
          private_ip: "hostname -I 2>/dev/null | awk '{print $1}' || echo ''"
        };

        const results: Record<string, string> = {};
        let completed = 0;
        const total = Object.keys(commands).length;

        const checkComplete = () => {
          completed++;
          if (completed === total) {
            const osClean = results.os.replace(/\\n/g, '').trim();
            
            const data = {
              os: osClean || 'Unknown',
              cpu_cores: parseInt(results.cpu_cores, 10) || 0,
              memory_gb: parseFloat(results.memory_gb) || 0,
              disk_gb: parseInt(results.disk_gb, 10) || 0,
              ip_address: results.ip_address.trim(),
              private_ip: results.private_ip.trim()
            };

            db.prepare(`
              UPDATE servers 
              SET os = ?, cpu_cores = ?, memory_gb = ?, disk_gb = ?, 
                  ip_address = ?, private_ip = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(data.os, data.cpu_cores, data.memory_gb, data.disk_gb, data.ip_address, data.private_ip, serverId);

            logger.info(`Server info collected for ${server.name} (${serverId})`);
            safeResolve({ success: true, data });
          }
        };

        for (const [key, cmd] of Object.entries(commands)) {
          conn.exec(cmd, (err, stream) => {
            if (err) {
              results[key] = '';
              checkComplete();
              return;
            }

            let output = '';
            stream.on('data', (data: Buffer) => {
              output += data.toString('utf-8');
            });

            stream.on('close', () => {
              results[key] = output.trim();
              checkComplete();
            });

            stream.stderr.on('data', () => { /* ignore stderr */ });
          });
        }
      });

      conn.on('error', (err) => {
        safeResolve({ success: false, error: `SSH connection error: ${err.message}` });
      });

      conn.on('timeout', () => {
        safeResolve({ success: false, error: 'SSH connection timeout' });
      });

      const connectConfig: Record<string, unknown> = {
        host: server.hostname,
        port: server.port || 22,
        username: server.username,
        readyTimeout: ServerInfoCollector.CONNECT_TIMEOUT,
        maxTries: 1
      };

      if (server.use_ssh_key && decryptedPrivateKey) {
        connectConfig.privateKey = decryptedPrivateKey;
      } else if (decryptedPassword) {
        connectConfig.password = decryptedPassword;
      } else {
        safeResolve({ success: false, error: 'No authentication method configured' });
        return;
      }

      conn.connect(connectConfig);
    });
  }

  async collectAllServers(): Promise<{
    success: number;
    failed: number;
    errors: Array<{ serverId: string; serverName: string; error: string }>;
  }> {
    const servers = db.prepare('SELECT id, name FROM servers WHERE enabled = 1').all() as { id: string; name: string }[];
    
    const errors: Array<{ serverId: string; serverName: string; error: string }> = [];
    let success = 0;

    for (const server of servers) {
      const result = await this.collectServerInfo(server.id);
      if (result.success) {
        success++;
      } else {
        errors.push({ serverId: server.id, serverName: server.name, error: result.error || 'Unknown error' });
      }
    }

    return { success, failed: errors.length, errors };
  }
}

export const serverInfoCollector = new ServerInfoCollector();
