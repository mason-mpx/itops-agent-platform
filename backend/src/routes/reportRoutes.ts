import { Router, Request, Response } from 'express';
import { reportService } from '../services/reportService';

const router = Router();

router.get('/templates', (_req: Request, res: Response) => {
  try {
    const templates = reportService.getTemplates();
    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/templates/:id', (req: Request, res: Response) => {
  try {
    const template = reportService.getTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, error: '模板不存在' });
    }
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/templates', (req: Request, res: Response) => {
  try {
    const { name, description, type, content, variables } = req.body;
    const template = reportService.createTemplate({
      name,
      description,
      type,
      content,
      variables,
      is_preset: false
    });
    res.status(201).json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.put('/templates/:id', (req: Request, res: Response) => {
  try {
    const { name, description, content, variables } = req.body;
    const template = reportService.updateTemplate(req.params.id, {
      name,
      description,
      content,
      variables
    });
    if (!template) {
      return res.status(404).json({ success: false, error: '模板不存在' });
    }
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/templates/:id', (req: Request, res: Response) => {
  try {
    const deleted = reportService.deleteTemplate(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: '模板不存在或为预设模板不可删除' });
    }
    res.json({ success: true, message: '模板已删除' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/', (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const reports = reportService.getReports(limit);
    res.json({ success: true, data: reports });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const report = reportService.getReport(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, error: '报告不存在' });
    }
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/generate', (req: Request, res: Response) => {
  try {
    const { templateId, variables, format } = req.body;
    const report = reportService.generateReport(templateId, variables, format);
    res.status(201).json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id/export', async (req: Request, res: Response) => {
  try {
    const format = (req.query.format as 'pdf' | 'word') || 'pdf';
    const exported = await reportService.exportReport(req.params.id, format);
    const report = reportService.getReport(req.params.id);
    
    res.setHeader('Content-Type', exported.type);
    res.setHeader('Content-Disposition', `attachment; filename="${report?.name || 'report'}.${format === 'pdf' ? 'txt' : format === 'word' ? 'txt' : 'md'}"`);
    res.send(exported.content);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/scheduled/all', (_req: Request, res: Response) => {
  try {
    const reports = reportService.getScheduledReports();
    res.json({ success: true, data: reports });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/scheduled/:id', (req: Request, res: Response) => {
  try {
    const report = reportService.getScheduledReport(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, error: '定时报告不存在' });
    }
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/scheduled', (req: Request, res: Response) => {
  try {
    const { name, template_id, cron_expression, enabled, recipients, format } = req.body;
    const report = reportService.createScheduledReport({
      name,
      template_id,
      cron_expression,
      enabled: enabled !== undefined ? enabled : true,
      recipients,
      format: format || 'markdown'
    });
    res.status(201).json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.put('/scheduled/:id', (req: Request, res: Response) => {
  try {
    const { name, template_id, cron_expression, enabled, recipients, format } = req.body;
    const report = reportService.updateScheduledReport(req.params.id, {
      name,
      template_id,
      cron_expression,
      enabled,
      recipients,
      format
    });
    if (!report) {
      return res.status(404).json({ success: false, error: '定时报告不存在' });
    }
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/scheduled/:id', (req: Request, res: Response) => {
  try {
    const deleted = reportService.deleteScheduledReport(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: '定时报告不存在' });
    }
    res.json({ success: true, message: '定时报告已删除' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
