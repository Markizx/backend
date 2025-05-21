import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import * as Sentry from '@sentry/node';
import { SubscriptionController } from '@controllers/subscription.controller';
import { authenticate } from '@middleware/auth.middleware';
import { publicRateLimiter } from '@middleware/rate.limiter';

const router = Router();

router.use(publicRateLimiter);

router.post('/checkout', authenticate, SubscriptionController.createCheckoutSessionHandler);

router.get('/status', authenticate, SubscriptionController.checkSubscriptionStatusHandler);

router.post('/webhook', express.raw({ type: 'application/json' }), SubscriptionController.webhookHandler);

export default router;