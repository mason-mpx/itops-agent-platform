import { Router, Request, Response } from 'express';
import { alertNoiseReductionService } from '../services/alertNoiseReductionService';

const router = Router();

router.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = alertNoiseReductionService.getNoiseReductionStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/suppressed', (_req: Request, res: Response) => {
  try {
    const alerts = alertNoiseReductionService.getSuppressedAlerts();
    res.json({ success: true, data: alerts });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/unsuppress', (req: Request, res: Response) => {
  try {
    const { fingerprint } = req.body;
    if (!fingerprint) {
      return res.status(400).json({ success: false, error: '指纹不能为空' });
    }

    const result = alertNoiseReductionService.unsuppressAlert(fingerprint);
    if (!result) {
      return res.status(404).json({ success: false, error: '未找到对应的告警' });
    }

    res.json({ success: true, message: '告警已恢复' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/suppress', (req: Request, res: Response) => {
  try {
    const { fingerprint, reason, durationMinutes = 60 } = req.body;
    if (!fingerprint || !reason) {
      return res.status(400).json({ success: false, error: '指纹和原因不能为空' });
    }

    const result = alertNoiseReductionService.manuallySuppressAlert(
      fingerprint,
      reason,
      durationMinutes
    );

    if (!result) {
      return res.status(404).json({ success: false, error: '未找到对应的告警' });
    }

    res.json({ success: true, message: '告警已抑制' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/cleanup', (req: Request, res: Response) => {
  try {
    const { daysToKeep = 30 } = req.body;
    const deletedCount = alertNoiseReductionService.cleanupOldRecords(daysToKeep);
    res.json({ success: true, data: { deletedCount } });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
