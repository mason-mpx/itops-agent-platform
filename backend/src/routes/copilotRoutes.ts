import { Router, Request, Response } from 'express';
import { copilotService } from '../services/copilotService';

const router = Router();

router.get('/suggestions', (_req: Request, res: Response) => {
  try {
    const suggestions = copilotService.getQuickSuggestions();
    res.json({ success: true, data: suggestions });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/conversations', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || 'default';
    const conversations = copilotService.getUserConversations(userId);
    res.json({ success: true, data: conversations });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/conversations', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || 'default';
    const conversation = copilotService.createConversation(userId);
    res.status(201).json({ success: true, data: conversation });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/conversations/:id', (req: Request, res: Response) => {
  try {
    const conversation = copilotService.getConversation(req.params.id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: '对话不存在' });
    }
    res.json({ success: true, data: conversation });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/conversations/:id', (req: Request, res: Response) => {
  try {
    const deleted = copilotService.deleteConversation(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: '对话不存在' });
    }
    res.json({ success: true, message: '对话已删除' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { conversationId, message } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, error: '消息不能为空' });
    }

    const userId = (req as any).user?.id || 'default';
    const response = await copilotService.processNaturalLanguage(
      conversationId,
      message,
      userId
    );

    res.json({ success: true, data: { response } });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
