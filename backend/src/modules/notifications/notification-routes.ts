/**
 * Notification routes — computed on-the-fly notifications for the authenticated user.
 * Sources: unreplied conversations, today/tomorrow appointments, disconnected Zalo accounts.
 */
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { zaloPool } from '../zalo/zalo-pool.js';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  detail: string;
  priority: string;
  createdAt: string;
}

export async function notificationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/notifications', async (request) => {
    const user = request.user!;
    const notifications: NotificationItem[] = [];

    // 1. Unreplied conversations > 30 min
    const thirtyMinAgo = new Date(Date.now() - 30 * 60000);
    const unreplied = await prisma.conversation.count({
      where: { orgId: user.orgId, isReplied: false, lastMessageAt: { lt: thirtyMinAgo } },
    });
    if (unreplied > 0) {
      notifications.push({
        id: 'unreplied',
        type: 'warning',
        priority: 'high',
        title: `${unreplied} cuộc trò chuyện chưa trả lời`,
        detail: 'Có tin nhắn chưa phản hồi quá 30 phút',
        createdAt: new Date().toISOString(),
      });
    }

    // 2. Today's appointments
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const todayApts = await prisma.appointment.findMany({
      where: {
        orgId: user.orgId,
        appointmentDate: { gte: todayStart, lt: todayEnd },
        status: 'scheduled',
      },
      include: { contact: { select: { fullName: true } } },
      take: 5,
    });
    for (const apt of todayApts) {
      notifications.push({
        id: `apt-${apt.id}`,
        type: 'info',
        priority: 'medium',
        title: `Lịch hẹn: ${apt.contact?.fullName || 'KH'}`,
        detail: `${apt.appointmentTime || ''} - ${apt.notes || 'Tái khám'}`,
        createdAt: apt.appointmentDate.toISOString(),
      });
    }

    // 3. Tomorrow's appointments
    const tomorrowStart = new Date(todayEnd);
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

    const tmrApts = await prisma.appointment.count({
      where: {
        orgId: user.orgId,
        appointmentDate: { gte: tomorrowStart, lt: tomorrowEnd },
        status: 'scheduled',
      },
    });
    if (tmrApts > 0) {
      notifications.push({
        id: 'tmr-apts',
        type: 'info',
        priority: 'low',
        title: `${tmrApts} lịch hẹn ngày mai`,
        detail: 'Chuẩn bị cho ngày mai',
        createdAt: new Date().toISOString(),
      });
    }

    // 4. Overdue debt — orders with debt past due date, scoped to user.
    //    Same scope as orderScopeWhere(): owner+admin see all, member only
    //    sees orders they own.
    const isAdmin = user.role === 'owner' || user.role === 'admin';
    const orderScope = isAdmin
      ? { orgId: user.orgId }
      : {
          orgId: user.orgId,
          OR: [
            { assignedSaleId: user.id },
            { createdByUserId: user.id },
            { contact: { assignedUserId: user.id } },
          ],
        };

    const overdueDebtList = await prisma.order.findMany({
      where: {
        AND: [
          orderScope,
          {
            debtAmountValue: { gt: 0 },
            debtDueDate: { lt: new Date() },
            status: { notIn: ['cancelled'] },
          },
        ],
      },
      select: {
        id: true,
        orderCode: true,
        debtAmountValue: true,
        debtDueDate: true,
        contact: { select: { fullName: true, phone: true } },
      },
      orderBy: { debtDueDate: 'asc' },
      take: 5,
    });
    for (const o of overdueDebtList) {
      const days = o.debtDueDate
        ? Math.ceil((Date.now() - o.debtDueDate.getTime()) / (24 * 60 * 60 * 1000))
        : 0;
      notifications.push({
        id: `overdue-${o.id}`,
        type: 'error',
        priority: 'high',
        title: `Đơn ${o.orderCode} quá hạn nợ ${days} ngày`,
        detail: `${o.contact?.fullName ?? 'KH'} · còn ${Number(o.debtAmountValue).toLocaleString('vi-VN')} đ`,
        createdAt: o.debtDueDate?.toISOString() ?? new Date().toISOString(),
      });
    }

    // 5. Expiring batches (90 days). Org-wide — anyone in org should know.
    const horizon = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const expiringBatches = await prisma.inventoryBatch.findMany({
      where: {
        orgId: user.orgId,
        status: 'active',
        currentQuantity: { gt: 0 },
        expiryDate: { not: null, lt: horizon },
      },
      select: {
        id: true,
        batchCode: true,
        currentQuantity: true,
        expiryDate: true,
        product: { select: { sku: true, name: true } },
      },
      orderBy: { expiryDate: 'asc' },
      take: 3,
    });
    for (const b of expiringBatches) {
      const days = b.expiryDate
        ? Math.ceil((b.expiryDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
        : 0;
      notifications.push({
        id: `batch-${b.id}`,
        type: days < 0 ? 'error' : 'warning',
        priority: days < 30 ? 'high' : 'medium',
        title: days < 0
          ? `Lô ${b.batchCode} đã hết hạn`
          : `Lô ${b.batchCode} hết hạn trong ${days} ngày`,
        detail: `${b.product?.name ?? ''} · còn ${b.currentQuantity}`,
        createdAt: b.expiryDate?.toISOString() ?? new Date().toISOString(),
      });
    }

    // 6b. Overdue supplier payments (công nợ NCC quá hạn) — owner/admin only
    //     (cost/debt-sensitive; member không thấy công nợ NCC).
    if (isAdmin) {
      const overdueImports = await prisma.importOrder.findMany({
        where: {
          orgId: user.orgId,
          status: 'confirmed',
          debtAmount: { gt: 0 },
          paymentDueDate: { lt: new Date() },
        },
        select: {
          id: true,
          importCode: true,
          debtAmount: true,
          paymentDueDate: true,
          supplier: { select: { name: true } },
        },
        orderBy: { paymentDueDate: 'asc' },
        take: 5,
      });
      for (const o of overdueImports) {
        const days = o.paymentDueDate
          ? Math.ceil((Date.now() - o.paymentDueDate.getTime()) / (24 * 60 * 60 * 1000))
          : 0;
        notifications.push({
          id: `supplier-overdue-${o.id}`,
          type: 'error',
          priority: 'high',
          title: `Nợ NCC ${o.importCode} quá hạn ${days} ngày`,
          detail: `${o.supplier?.name ?? 'NCC'} · còn ${Number(o.debtAmount).toLocaleString('vi-VN')} đ`,
          createdAt: o.paymentDueDate?.toISOString() ?? new Date().toISOString(),
        });
      }
    }

    // 6. Disconnected Zalo accounts
    const accounts = await prisma.zaloAccount.findMany({
      where: { orgId: user.orgId },
      select: { id: true, displayName: true },
    });
    for (const acc of accounts) {
      const status = zaloPool.getStatus(acc.id);
      if (status !== 'connected') {
        notifications.push({
          id: `zalo-${acc.id}`,
          type: 'error',
          priority: 'high',
          title: `Zalo "${acc.displayName}" mất kết nối`,
          detail: `Trạng thái: ${status}`,
          createdAt: new Date().toISOString(),
        });
      }
    }

    return { notifications };
  });
}
