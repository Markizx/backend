import express, { Router, Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import { authenticate } from '@middleware/auth.middleware';
import { requireAdmin } from '@middleware/role.middleware';
import { publicRateLimiter } from '@middleware/rate.limiter';
import { SupportController } from '@controllers/support.controller';

const router = Router();

router.use(publicRateLimiter);
router.use(authenticate);

router.post('/ticket', SupportController.createTicketHandler);

router.get('/tickets', SupportController.getUserTicketsHandler);

router.get('/tickets/all', requireAdmin, SupportController.getAllTicketsHandler);

router.patch('/tickets/:id/respond', requireAdmin, SupportController.respondToTicketHandler);

export default router;