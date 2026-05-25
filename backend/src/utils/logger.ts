import { env } from './env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: unknown;
}

class Logger {
  private level: LogLevel;
  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  constructor() {
    const configLevel = env.LOG_LEVEL as LogLevel;
    if (configLevel && this.levels[configLevel] !== undefined) {
      this.level = configLevel;
    } else {
      this.level = env.NODE_ENV === 'production' ? 'info' : 'debug';
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.level];
  }

  private format(level: LogLevel, message: string, meta?: unknown): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      meta
    };
  }

  private log(level: LogLevel, message: string, meta?: unknown): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry = this.format(level, message, meta);
    
    if (env.NODE_ENV === 'production') {
      console.log(JSON.stringify(entry));
    } else {
      // 开发环境的彩色输出
      const colors = {
        debug: '\x1b[36m', // cyan
        info: '\x1b[32m',  // green
        warn: '\x1b[33m',  // yellow
        error: '\x1b[31m'  // red
      };
      const reset = '\x1b[0m';
      
      const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]`;
      console.log(`${colors[level]}${prefix}${reset} ${message}`);
      
      if (meta) {
        console.log(meta);
      }
    }
  }

  debug(message: string, meta?: unknown): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: unknown): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: unknown): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: unknown): void {
    this.log('error', message, meta);
  }
}

export const logger = new Logger();
