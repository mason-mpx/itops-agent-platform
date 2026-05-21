import { scheduleJob, Job } from 'node-schedule';
import { randomUUID } from 'crypto';
import db from '../models/database';
import { logger } from '../utils/logger';
import { executeWorkflow } from './workflowExecutor';

class SchedulerService {
  private jobs: Map<string, Job> = new Map();
  private initialized: boolean = false;
  private runningWorkflows: Set<string> = new Set();

  constructor() {
    // 延迟初始化，等待数据库准备好
  }

  init() {
    if (this.initialized) return;
    
    try {
      // 从数据库加载所有启用的定时任务
      const tasks = db.prepare('SELECT * FROM scheduled_tasks WHERE enabled = 1').all() as any[];
      
      tasks.forEach(task => {
        this.scheduleTask(task);
      });
      
      this.initialized = true;
      logger.info(`✅ Scheduler initialized with ${tasks.length} tasks`);
    } catch (e) {
      logger.info("⚠️  Could not initialize scheduler:", (e as Error).message);
    }
  }

  scheduleTask(task: any) {
    // 先取消已存在的任务
    this.cancelTask(task.id);

    try {
      const job = scheduleJob(task.schedule, async () => {
        logger.info(`⏰ Executing scheduled task: ${task.name} (${task.id})`);
        
        db.prepare(`
          UPDATE scheduled_tasks 
          SET last_run = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(task.id);

        // 如果关联了工作流，则执行
        if (task.workflow_id) {
          await this.executeWorkflow(task);
        }
        
        // 记录审计日志
        db.prepare(`
          INSERT INTO audit_logs (id, action, resource_type, resource_id, details, created_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
          randomUUID(),
          'execute_scheduled_task',
          'scheduled_task',
          task.id,
          JSON.stringify({
            task_name: task.name,
            workflow_id: task.workflow_id,
            executed_at: new Date().toISOString()
          })
        );
      });

      this.jobs.set(task.id, job);
      
      // 计算下次执行时间
      const nextRun = job.nextInvocation();
      if (nextRun) {
        db.prepare(`
          UPDATE scheduled_tasks 
          SET next_run = ? 
          WHERE id = ?
        `).run(nextRun.toISOString(), task.id);
      }

    } catch (error) {
      logger.error(`❌ Failed to schedule task ${task.name}:`, error);
    }
  }

  async executeWorkflow(task: any) {
    try {
      const workflowId = task.workflow_id;
      
      // 防止同一工作流并发执行
      if (this.runningWorkflows.has(workflowId)) {
        logger.warn(`⚠️ Workflow ${workflowId} is already running, skipping execution`);
        return;
      }
      
      this.runningWorkflows.add(workflowId);

      // 获取工作流信息
      const workflow = db.prepare('SELECT * FROM workflows WHERE id = ?').get(workflowId) as any;
      
      if (!workflow) {
        logger.error(`Workflow ${workflowId} not found for scheduled task ${task.name}`);
        return;
      }

      // 创建任务执行记录
      const taskId = randomUUID();
      db.prepare(`
        INSERT INTO tasks (id, workflow_id, name, status, created_at)
        VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP)
      `).run(taskId, workflowId, `定时执行: ${workflow.name}`);

      logger.info(`✅ Created task ${taskId} for workflow ${workflow.name}`);
      
      // 真正执行工作流
      await executeWorkflow(taskId, workflow);
      
    } catch (error) {
      logger.error(`❌ Error executing scheduled workflow:`, error);
    } finally {
      this.runningWorkflows.delete(task.workflow_id);
    }
  }

  cancelTask(taskId: string) {
    const job = this.jobs.get(taskId);
    if (job) {
      job.cancel();
      this.jobs.delete(taskId);
      logger.info(`⏹️ Cancelled scheduled task: ${taskId}`);
    }
  }

  updateTask(task: any) {
    if (task.enabled) {
      this.scheduleTask(task);
    } else {
      this.cancelTask(task.id);
    }
  }

  deleteTask(taskId: string) {
    this.cancelTask(taskId);
  }

  getNextExecution(taskId: string): Date | null {
    const job = this.jobs.get(taskId);
    if (!job) return null;
    const nextInvocation = job.nextInvocation();
    return nextInvocation as Date | null;
  }

  getRunningTasks(): string[] {
    return Array.from(this.jobs.keys());
  }

  shutdown() {
    this.jobs.forEach((job, taskId) => {
      job.cancel();
      logger.info(`⏹️ Shutdown task: ${taskId}`);
    });
    this.jobs.clear();
    this.initialized = false;
    logger.info('✅ Scheduler shutdown complete');
  }
}

export const schedulerService = new SchedulerService();
