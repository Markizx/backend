import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import * as Sentry from '@sentry/node';
import { SupportTicket, SupportTicketDocument } from '@models/SupportTicket';
import { AuthenticatedRequest } from '@middleware/auth.middleware';
import { I18nRequest } from '@middleware/i18n.middleware';
import { asyncHandler } from '@utils/asyncHandler';
import { ApiResponse } from '@utils/response';
import logger from '@utils/logger';

/**
 * Контроллер для работы с тикетами поддержки
 */
export const SupportController = {
  /**
   * Создание нового тикета поддержки
   */
  createTicketHandler: asyncHandler(async (
    req: Request<{}, {}, { subject: string; message: string }>,
    res: Response
  ) => {
    const authReq = req as AuthenticatedRequest & I18nRequest & {
      body: { subject: string; message: string };
    };
    
    const { subject, message } = authReq.body;
    const userId = authReq.user?.id;

    if (!userId) {
      return ApiResponse.sendError(res, await authReq.t('errors.unauthorized'), null, 401);
    }

    if (!subject || !message) {
      return ApiResponse.sendError(res, await authReq.t('errors.validation_error'), null, 400);
    }

    if (typeof subject !== 'string' || subject.length > 100) {
      return ApiResponse.sendError(res, await authReq.t('errors.validation_error'), null, 400);
    }

    if (typeof message !== 'string' || message.length > 1000) {
      return ApiResponse.sendError(res, await authReq.t('errors.validation_error'), null, 400);
    }

    const ticket: SupportTicketDocument = await SupportTicket.create({
      user: userId,
      subject,
      message,
      status: 'open',
    });

    logger.info(`Тикет создан: ${ticket._id} для пользователя ${userId}`);
    return ApiResponse.send(res, { ticket }, await authReq.t('success.ticket_created'), 201);
  }),

  /**
   * Получение тикетов поддержки пользователя
   */
  getUserTicketsHandler: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest & I18nRequest;
    
    const userId = authReq.user?.id;
    if (!userId) {
      return ApiResponse.sendError(res, await authReq.t('errors.unauthorized'), null, 401);
    }

    const tickets = await SupportTicket.find({ user: userId });
    logger.info(`Получены тикеты для пользователя: ${userId}`);
    return ApiResponse.send(res, tickets);
  }),

  /**
   * Получение всех тикетов поддержки (админский доступ)
   */
  getAllTicketsHandler: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest & I18nRequest;
    
    const tickets = await SupportTicket.find().populate('user', 'email');
    logger.info('Получены все тикеты');
    return ApiResponse.send(res, tickets);
  }),

  /**
   * Ответ администратора на тикет поддержки
   */
  respondToTicketHandler: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest & I18nRequest & {
      params: { id: string };
      body: { response: string };
    };
    
    const { id } = authReq.params;
    const { response } = authReq.body;

    if (!id) {
      return ApiResponse.sendError(res, await authReq.t('errors.validation_error'), null, 400);
    }

    if (!response) {
      return ApiResponse.sendError(res, await authReq.t('errors.validation_error'), null, 400);
    }

    if (typeof response !== 'string' || response.length > 1000) {
      return ApiResponse.sendError(res, await authReq.t('errors.validation_error'), null, 400);
    }

    const ticket = await SupportTicket.findById(id) as SupportTicketDocument | null;
    if (!ticket) {
      return ApiResponse.sendError(res, await authReq.t('errors.not_found'), null, 404);
    }

    ticket.response = response;
    ticket.status = 'answered';
    await ticket.save();

    logger.info(`Ответ на тикет ${id} сохранён администратором ${authReq.user?.email}`);
    return ApiResponse.send(res, { ticket }, await authReq.t('success.ticket_responded'));
  })
};