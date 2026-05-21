import db from '../models/database';
import { randomUUID } from 'crypto';
import { generateCompletion } from './llmService';

interface RootCauseAnalysis {
  id: string;
  alert_id?: string;
  title: string;
  description?: string;
  status: 'pending' | 'analyzing' | 'completed' | 'failed';
  root_cause?: string;
  symptoms?: string; // JSON array
  timeline?: string; // JSON array
  evidence?: string; // JSON array
  recommendations?: string; // JSON array
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

interface CreateRCAInput {
  alert_id?: string;
  title: string;
  description?: string;
}

interface UpdateRCAInput {
  title?: string;
  description?: string;
  status?: 'pending' | 'analyzing' | 'completed' | 'failed';
  root_cause?: string;
  symptoms?: string[];
  timeline?: Array<{ time: string; event: string }>;
  evidence?: string[];
  recommendations?: string[];
}

class RootCauseAnalysisService {
  private createRCAs: any;
  private updateRCAs: any;
  private getRCAs: any;
  private getRCAById: any;
  private getByAlertId: any;
  private deleteRCA: any;

  constructor() {
    // 延迟初始化，等待数据库准备好
  }

  init() {
    try {
      this.initializeStatements();
    } catch (e) {
      console.log("⚠️  RootCauseAnalysisService initialization failed:", (e as Error).message);
    }
  }

  private initializeStatements() {
    try {
      this.createRCAs = db.prepare(`
        INSERT INTO root_cause_analyses (id, alert_id, title, description, status, symptoms, timeline, evidence, recommendations, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

      this.updateRCAs = db.prepare(`
        UPDATE root_cause_analyses
        SET title = COALESCE(?, title),
            description = COALESCE(?, description),
            status = COALESCE(?, status),
            root_cause = COALESCE(?, root_cause),
          symptoms = COALESCE(?, symptoms),
          timeline = COALESCE(?, timeline),
          evidence = COALESCE(?, evidence),
          recommendations = COALESCE(?, recommendations),
          updated_at = CURRENT_TIMESTAMP,
          completed_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END
        WHERE id = ?
      `);

      const getRCABase = 'SELECT * FROM root_cause_analyses';

      this.getRCAs = db.prepare(`${getRCABase} ORDER BY created_at DESC`);

      this.getRCAById = db.prepare(`${getRCABase} WHERE id = ?`);

      this.getByAlertId = db.prepare(`${getRCABase} WHERE alert_id = ?`);

      this.deleteRCA = db.prepare('DELETE FROM root_cause_analyses WHERE id = ?');
    } catch (e) {
      console.log("⚠️  Could not initialize RootCauseAnalysisService statements:", (e as Error).message);
    }
  }

  create(input: CreateRCAInput): RootCauseAnalysis {
    const id = randomUUID();
    const status = 'pending' as const;
    
    if (!this.createRCAs) this.initializeStatements();
    this.createRCAs.run(
      id,
      input.alert_id || null,
      input.title,
      input.description || null,
      status,
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify([])
    );

    if (!this.getRCAById) this.initializeStatements();
    return this.getRCAById.get(id) as RootCauseAnalysis;
  }

  update(id: string, input: UpdateRCAInput): RootCauseAnalysis | undefined {
    if (!this.getRCAById) this.initializeStatements();
    const existing = this.getRCAById.get(id);
    if (!existing) {
      return undefined;
    }

    if (!this.updateRCAs) this.initializeStatements();
    this.updateRCAs.run(
      input.title,
      input.description,
      input.status,
      input.root_cause,
      input.symptoms ? JSON.stringify(input.symptoms) : undefined,
      input.timeline ? JSON.stringify(input.timeline) : undefined,
      input.evidence ? JSON.stringify(input.evidence) : undefined,
      input.recommendations ? JSON.stringify(input.recommendations) : undefined,
      input.status,
      id
    );

    return this.getRCAById.get(id) as RootCauseAnalysis;
  }

  list(): RootCauseAnalysis[] {
    if (!this.getRCAs) this.initializeStatements();
    return this.getRCAs.all() as RootCauseAnalysis[];
  }

  get(id: string): RootCauseAnalysis | undefined {
    if (!this.getRCAById) this.initializeStatements();
    return this.getRCAById.get(id) as RootCauseAnalysis | undefined;
  }

  getByAlert(alertId: string): RootCauseAnalysis | undefined {
    if (!this.getByAlertId) this.initializeStatements();
    return this.getByAlertId.get(alertId) as RootCauseAnalysis | undefined;
  }

  delete(id: string): boolean {
    if (!this.deleteRCA) this.initializeStatements();
    const result = this.deleteRCA.run(id);
    return result.changes > 0;
  }

  async analyze(id: string): Promise<RootCauseAnalysis | undefined> {
    if (!this.getRCAById) this.initializeStatements();
    const existing = this.getRCAById.get(id) as RootCauseAnalysis;
    if (!existing) {
      return undefined;
    }

    // 更新状态为分析中
    this.update(id, { status: 'analyzing' });

    try {
      let analysisResult;

      try {
        // 优先使用 LLM 进行分析
        analysisResult = await this.performLLMAnalysis(existing);
      } catch (llmError) {
        console.log('⚠️ LLM分析失败，使用预设分析结果:', (llmError as Error).message);
        // LLM 分析失败时，提供一个合理的回退方案
        analysisResult = this.generateFallbackAnalysis(existing);
      }

      // 更新分析结果
      return this.update(id, analysisResult);
    } catch (error) {
      // 分析失败，更新状态
      this.update(id, { status: 'failed' });
      throw error;
    }
  }

  private generateFallbackAnalysis(rca: RootCauseAnalysis): UpdateRCAInput {
    const fallbackSymptoms = [
      '需要进一步系统检查',
      '建议查看相关日志',
      '需要人工介入分析'
    ];

    const fallbackTimeline = [
      { time: new Date().toISOString().replace('T', ' ').substring(0, 19), event: '开始根因分析' },
      { time: new Date().toISOString().replace('T', ' ').substring(0, 19), event: '分析完成，需要人工验证' }
    ];

    const fallbackEvidence = [
      '需要人工收集更多证据',
      '建议查看系统日志和应用日志'
    ];

    const fallbackRecommendations = [
      '人工检查系统状态',
      '查看相关日志文件',
      '配置合适的LLM API以获得更好的分析结果'
    ];

    return {
      status: 'completed',
      root_cause: `需要人工调查 ${rca.title} 的详细原因。建议检查系统日志、监控指标和相关配置。`,
      symptoms: fallbackSymptoms,
      timeline: fallbackTimeline,
      evidence: fallbackEvidence,
      recommendations: fallbackRecommendations
    };
  }

  private async performLLMAnalysis(rca: RootCauseAnalysis): Promise<UpdateRCAInput> {
    // 获取告警信息（如果有关联告警）
    let alertInfo = '';
    if (rca.alert_id) {
      const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(rca.alert_id);
      if (alert) {
        alertInfo = `
告警标题: ${(alert as any).title}
告警内容: ${(alert as any).content}
告警级别: ${(alert as any).severity}
告警来源: ${(alert as any).source}
`;
      }
    }

    const prompt = `作为专业的IT运维根因分析专家，请对以下告警进行深入的根因分析。

分析主题: ${rca.title}
${rca.description ? `问题描述: ${rca.description}` : ''}
${alertInfo}

请按照以下结构输出分析结果（JSON格式）:
{
  "root_cause": "详细的根因描述",
  "symptoms": ["症状1", "症状2", "症状3"],
  "timeline": [
    {"time": "时间", "event": "事件描述"}
  ],
  "evidence": ["证据1", "证据2"],
  "recommendations": ["建议1", "建议2", "建议3"]
}

要求：
1. root_cause: 深入分析根本原因
2. symptoms: 列出观察到的症状
3. timeline: 构建故障发生的时间线
4. evidence: 分析过程中收集的证据
5. recommendations: 提供具体的修复和预防建议`;

    try {
      const response = await generateCompletion(prompt);
      
      // 解析LLM响应
      let analysisData;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('无法解析LLM响应');
        }
      } catch {
        // 如果解析失败，使用默认结构
        analysisData = {
          root_cause: response.substring(0, 500),
          symptoms: ['系统异常'],
          timeline: [],
          evidence: [],
          recommendations: ['进一步调查']
        };
      }

      return {
        status: 'completed',
        root_cause: analysisData.root_cause,
        symptoms: analysisData.symptoms,
        timeline: analysisData.timeline,
        evidence: analysisData.evidence,
        recommendations: analysisData.recommendations
      };
    } catch (error) {
      throw new Error('LLM分析失败: ' + (error as Error).message);
    }
  }
}

export const rootCauseAnalysisService = new RootCauseAnalysisService();
