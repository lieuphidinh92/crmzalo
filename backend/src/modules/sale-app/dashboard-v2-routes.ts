import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { canSeeAllOrders, reqUser } from '../orders/order-service.js';
import { logger } from '../../shared/utils/logger.js';
import { getSaleDashboardV2, getSaleMonthlyOrders } from './dashboard-v2-service.js';
import {
  completeDashboardAction,
  setSaleDashboardTarget,
  snoozeDashboardAction,
  type SaleDashboardTarget,
} from './dashboard-v2-workflow-service.js';

type ActionBody = { actionKey: string; actionType: string; contactId: string };

export async function dashboardV2Routes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/sale-app/dashboard-v2', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return await getSaleDashboardV2(reqUser(request));
    } catch (err) {
      logger.error('[sale-app] dashboard-v2 error:', err);
      return reply.status(500).send({ error: 'Không tải được dashboard bán hàng' });
    }
  });

  app.get<{ Params: { saleId: string } }>(
    '/api/v1/sale-app/dashboard-v2/leaderboard/:saleId/orders',
    async (request, reply) => {
      try {
        const user = reqUser(request);
        if (request.params.saleId !== user.id && !canSeeAllOrders(user)) {
          return reply.status(403).send({ error: 'Bạn không có quyền xem đơn của nhân viên này' });
        }
        const result = await getSaleMonthlyOrders(user, request.params.saleId);
        if (!result) return reply.status(404).send({ error: 'Không tìm thấy nhân viên' });
        return result;
      } catch (err) {
        logger.error('[sale-app] dashboard-v2 sale orders error:', err);
        return reply.status(500).send({ error: 'Không tải được danh sách đơn hàng' });
      }
    },
  );

  app.put<{ Body: ActionBody }>(
    '/api/v1/sale-app/dashboard-v2/actions/complete',
    async (request, reply) => {
      try {
        const user = reqUser(request);
        const task = await completeDashboardAction(user.orgId, user.id, request.body);
        return { ok: true, taskId: task.id };
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message ?? 'Không thể hoàn tất việc' });
      }
    },
  );

  app.put<{ Body: ActionBody & { days?: number } }>(
    '/api/v1/sale-app/dashboard-v2/actions/snooze',
    async (request, reply) => {
      try {
        const user = reqUser(request);
        const task = await snoozeDashboardAction(
          user.orgId,
          user.id,
          request.body,
          request.body.days ?? 3,
        );
        return { ok: true, taskId: task.id, dueDate: task.dueDate };
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message ?? 'Không thể hoãn việc' });
      }
    },
  );

  app.put<{
    Params: { saleId: string };
    Body: Partial<SaleDashboardTarget> & { month?: string };
  }>('/api/v1/sale-app/dashboard-v2/targets/:saleId', async (request, reply) => {
    try {
      const user = reqUser(request);
      if (!['owner', 'admin'].includes(user.role)) {
        return reply.status(403).send({ error: 'Chỉ quản lý được cấu hình KPI' });
      }
      const { month, ...target } = request.body ?? {};
      const result = await setSaleDashboardTarget(
        user.orgId,
        request.params.saleId,
        target,
        month,
      );
      return { target: result };
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({ error: err.message ?? 'Không thể lưu KPI' });
    }
  });
}
