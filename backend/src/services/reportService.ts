import db from '../models/database';
import { randomUUID } from 'crypto';

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  type: 'incident' | 'inspection' | 'change';
  content: string;
  variables: string[];
  is_preset: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScheduledReport {
  id: string;
  name: string;
  template_id: string;
  cron_expression: string;
  enabled: boolean;
  recipients: string[];
  format: 'markdown' | 'pdf' | 'word';
  last_generated?: string;
  created_at: string;
  updated_at: string;
}

export interface GeneratedReport {
  id: string;
  name: string;
  type: 'incident' | 'inspection' | 'change';
  content: string;
  format: 'markdown' | 'pdf' | 'word';
  metadata: Record<string, any>;
  created_at: string;
}

class ReportService {
  private presetTemplates: Omit<ReportTemplate, 'id' | 'created_at' | 'updated_at'>[] = [
    {
      name: '故障报告模板',
      description: '标准故障处理报告',
      type: 'incident',
      content: `# 故障处理报告

## 基本信息
- **故障时间**: {{start_time}}
- **恢复时间**: {{end_time}}
- **故障级别**: {{severity}}
- **影响范围**: {{impact}}

## 故障描述
{{description}}

## 问题排查过程
{{troubleshooting}}

## 根因分析
{{root_cause}}

## 解决方案
{{solution}}

## 预防措施
{{prevention}}

## 附件
{{attachments}}

---
报告生成时间: {{generated_time}}
报告人: {{reporter}}`,
      variables: ['start_time', 'end_time', 'severity', 'impact', 'description', 'troubleshooting', 'root_cause', 'solution', 'prevention', 'attachments', 'generated_time', 'reporter'],
      is_preset: true
    },
    {
      name: '系统巡检报告模板',
      description: '定期系统健康检查报告',
      type: 'inspection',
      content: `# 系统巡检报告

## 巡检概览
- **巡检时间**: {{inspection_time}}
- **巡检范围**: {{scope}}
- **巡检人**: {{inspector}}

## 服务器状态
{{server_status}}

## 数据库状态
{{database_status}}

## 网络状态
{{network_status}}

## 应用状态
{{application_status}}

## 发现的问题
{{issues}}

## 改进建议
{{recommendations}}

---
报告生成时间: {{generated_time}}`,
      variables: ['inspection_time', 'scope', 'inspector', 'server_status', 'database_status', 'network_status', 'application_status', 'issues', 'recommendations', 'generated_time'],
      is_preset: true
    },
    {
      name: '变更记录模板',
      description: '系统变更操作记录',
      type: 'change',
      content: `# 变更记录

## 变更信息
- **变更时间**: {{change_time}}
- **变更类型**: {{change_type}}
- **变更人**: {{change_person}}
- **审核人**: {{reviewer}}

## 变更内容
{{content}}

## 变更原因
{{reason}}

## 变更影响
{{impact}}

## 回滚方案
{{rollback}}

## 执行结果
{{result}}

---
报告生成时间: {{generated_time}}`,
      variables: ['change_time', 'change_type', 'change_person', 'reviewer', 'content', 'reason', 'impact', 'rollback', 'result', 'generated_time'],
      is_preset: true
    }
  ];

  constructor() {
    // 延迟初始化，等待数据库准备好
  }

  init() {
    try {
      this.initializePresetTemplates();
    } catch (e) {
      console.log("⚠️  ReportService initialization failed:", (e as Error).message);
    }
  }

  private initializePresetTemplates() {
    try {
      const existingCount = db.prepare('SELECT COUNT(*) as count FROM report_templates WHERE is_preset = 1').get() as any;
      if (existingCount.count === 0) {
        for (const template of this.presetTemplates) {
          db.prepare(`
            INSERT INTO report_templates (id, name, description, type, content, variables, is_preset, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).run(
            randomUUID(),
            template.name,
            template.description,
            template.type,
            template.content,
            JSON.stringify(template.variables),
            1
          );
        }
        console.log('✅ 预设报告模板初始化完成');
      }
    } catch (e) {
      console.log("⚠️  Could not initialize report templates:", (e as Error).message);
    }
  }

  getTemplates(): ReportTemplate[] {
    const templates = db.prepare('SELECT * FROM report_templates ORDER BY is_preset DESC, created_at DESC').all() as any[];
    return templates.map(t => ({
      ...t,
      variables: JSON.parse(t.variables || '[]')
    }));
  }

  getTemplate(id: string): ReportTemplate | null {
    const template = db.prepare('SELECT * FROM report_templates WHERE id = ?').get(id) as any;
    if (!template) return null;
    return {
      ...template,
      variables: JSON.parse(template.variables || '[]')
    };
  }

  createTemplate(template: Omit<ReportTemplate, 'id' | 'created_at' | 'updated_at'>): ReportTemplate {
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO report_templates (id, name, description, type, content, variables, is_preset, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      template.name,
      template.description,
      template.type,
      template.content,
      JSON.stringify(template.variables),
      template.is_preset ? 1 : 0,
      now,
      now
    );
    return this.getTemplate(id)!;
  }

  updateTemplate(id: string, template: Partial<Omit<ReportTemplate, 'id' | 'created_at' | 'updated_at'>>): ReportTemplate | null {
    const existing = this.getTemplate(id);
    if (!existing) return null;

    const updates: string[] = [];
    const params: any[] = [];
    if (template.name !== undefined) { updates.push('name = ?'); params.push(template.name); }
    if (template.description !== undefined) { updates.push('description = ?'); params.push(template.description); }
    if (template.content !== undefined) { updates.push('content = ?'); params.push(template.content); }
    if (template.variables !== undefined) { updates.push('variables = ?'); params.push(JSON.stringify(template.variables)); }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(new Date().toISOString(), id);
      db.prepare(`UPDATE report_templates SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    return this.getTemplate(id);
  }

  deleteTemplate(id: string): boolean {
    const result = db.prepare('DELETE FROM report_templates WHERE id = ? AND is_preset = 0').run(id);
    return result.changes > 0;
  }

  generateReport(templateId: string, variables: Record<string, string>, format: 'markdown' | 'pdf' | 'word' = 'markdown'): GeneratedReport {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error('模板不存在');
    }

    let content = template.content;
    for (const [key, value] of Object.entries(variables)) {
      content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO generated_reports (id, name, type, content, format, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      `${template.name} - ${new Date().toLocaleString()}`,
      template.type,
      content,
      format,
      JSON.stringify({ templateId, variables }),
      now
    );

    return {
      id,
      name: `${template.name} - ${new Date().toLocaleString()}`,
      type: template.type,
      content,
      format,
      metadata: { templateId, variables },
      created_at: now
    };
  }

  getReports(limit = 20): GeneratedReport[] {
    // 从两个表中获取所有报告：generated_reports（模板生成）和 reports（工作流执行）
    const generatedReports = db.prepare('SELECT * FROM generated_reports ORDER BY created_at DESC LIMIT ?').all(limit) as any[];
    const workflowReports = db.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT ?').all(limit) as any[];
    
    // 合并并转换格式
    const allReports = [
      ...generatedReports.map(r => ({
        ...r,
        metadata: JSON.parse(r.metadata || '{}')
      })),
      ...workflowReports.map(r => ({
        id: r.id,
        name: r.name,
        type: 'inspection', // 默认类型
        content: r.content,
        format: r.format,
        metadata: { task_id: r.task_id },
        created_at: r.created_at
      }))
    ];
    
    // 按创建时间降序排序
    allReports.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    // 返回限制数量
    return allReports.slice(0, limit);
  }

  getReport(id: string): GeneratedReport | null {
    // 先从 generated_reports 查找
    let report = db.prepare('SELECT * FROM generated_reports WHERE id = ?').get(id) as any;
    if (report) {
      return {
        ...report,
        metadata: JSON.parse(report.metadata || '{}')
      };
    }
    
    // 如果没找到，再从 reports 表查找
    report = db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as any;
    if (report) {
      return {
        id: report.id,
        name: report.name,
        type: 'inspection',
        content: report.content,
        format: report.format,
        metadata: { task_id: report.task_id },
        created_at: report.created_at
      };
    }
    
    return null;
  }

  getScheduledReports(): ScheduledReport[] {
    const reports = db.prepare('SELECT * FROM scheduled_reports ORDER BY created_at DESC').all() as any[];
    return reports.map(r => ({
      ...r,
      recipients: JSON.parse(r.recipients || '[]'),
      enabled: Boolean(r.enabled)
    }));
  }

  createScheduledReport(report: Omit<ScheduledReport, 'id' | 'created_at' | 'updated_at'>): ScheduledReport {
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO scheduled_reports (id, name, template_id, cron_expression, enabled, recipients, format, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      report.name,
      report.template_id,
      report.cron_expression,
      report.enabled ? 1 : 0,
      JSON.stringify(report.recipients),
      report.format,
      now,
      now
    );
    return this.getScheduledReport(id)!;
  }

  getScheduledReport(id: string): ScheduledReport | null {
    const report = db.prepare('SELECT * FROM scheduled_reports WHERE id = ?').get(id) as any;
    if (!report) return null;
    return {
      ...report,
      recipients: JSON.parse(report.recipients || '[]'),
      enabled: Boolean(report.enabled)
    };
  }

  updateScheduledReport(id: string, report: Partial<Omit<ScheduledReport, 'id' | 'created_at' | 'updated_at'>>): ScheduledReport | null {
    const existing = this.getScheduledReport(id);
    if (!existing) return null;

    const updates: string[] = [];
    const params: any[] = [];
    if (report.name !== undefined) { updates.push('name = ?'); params.push(report.name); }
    if (report.template_id !== undefined) { updates.push('template_id = ?'); params.push(report.template_id); }
    if (report.cron_expression !== undefined) { updates.push('cron_expression = ?'); params.push(report.cron_expression); }
    if (report.enabled !== undefined) { updates.push('enabled = ?'); params.push(report.enabled ? 1 : 0); }
    if (report.recipients !== undefined) { updates.push('recipients = ?'); params.push(JSON.stringify(report.recipients)); }
    if (report.format !== undefined) { updates.push('format = ?'); params.push(report.format); }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(new Date().toISOString(), id);
      db.prepare(`UPDATE scheduled_reports SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    return this.getScheduledReport(id);
  }

  deleteScheduledReport(id: string): boolean {
    const result = db.prepare('DELETE FROM scheduled_reports WHERE id = ?').run(id);
    return result.changes > 0;
  }

  async exportReport(reportId: string, format: 'pdf' | 'word' = 'pdf'): Promise<{ content: string, type: string }> {
    const report = this.getReport(reportId);
    if (!report) {
      throw new Error('报告不存在');
    }

    if (format === 'pdf') {
      return {
        content: `# PDF导出: ${report.name}\n\n${report.content}`,
        type: 'text/plain'
      };
    } else if (format === 'word') {
      return {
        content: `# Word导出: ${report.name}\n\n${report.content}`,
        type: 'text/plain'
      };
    }

    return {
      content: report.content,
      type: 'text/markdown'
    };
  }
}

export const reportService = new ReportService();
