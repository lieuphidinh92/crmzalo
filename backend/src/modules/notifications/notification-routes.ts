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

    // ── BẮN HẾT TRUY VẤN CÙNG LÚC (25/8/2026) ──────────────────────────────
    // Trước đây 9 truy vấn này chạy NỐI ĐUÔI nhau. Chuông tải ở mọi màn hình nên
    // đó là 9 lượt chờ mạng cộng dồn (đo được 13 câu lệnh cho 1 lần bấm chuông).
    // Chúng độc lập nhau nên gom vào Promise.all: vẫn 13 câu lệnh nhưng chỉ tốn
    // thời gian bằng câu CHẬM NHẤT.
    const now = new Date();
    const thirtyMinAgo = new Date(Date.now() - 30 * 60000);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);
    const tomorrowStart = new Date(todayEnd);
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
    const horizon = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);
    const isAdmin = user.role === 'owner' || user.role === 'admin';
    // Cùng phạm vi với orderScopeWhere(): owner/admin thấy tất, member chỉ đơn mình.
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
    const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [
      unrepliedRes, todayAptsRes, tmrAptsRes, overdueDebtListRes, expiringBatchesRes,
      overdueImportsRes, thisMonthSessionRes, accountsRes, justIssuedRes,
    ] = await Promise.all([
      prisma.conversation.count({
      where: { orgId: user.orgId, isReplied: false, lastMessageAt: { lt: thirtyMinAgo } },
      }),
      prisma.appointment.findMany({
      where: {
      orgId: user.orgId,
      appointmentDate: { gte: todayStart, lt: todayEnd },
      status: 'scheduled',
      },
      include: { contact: { select: { fullName: true } } },
      take: 5,
      }),
      prisma.appointment.count({
      where: {
      orgId: user.orgId,
      appointmentDate: { gte: tomorrowStart, lt: tomorrowEnd },
      status: 'scheduled',
      },
      }),
      prisma.order.findMany({
      where: {
      AND: [
      orderScope,
      {
      debtAmountValue: { gt: 0 },
      debtDueDate: { lt: new Date() },
      status: { notIn: ['cancelled', 'returned'] },
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
      }),
      prisma.inventoryBatch.findMany({
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
      }),
      // 2 mục chỉ dành cho owner/admin — member không xem công nợ NCC / kiểm kho.
      isAdmin ? prisma.importOrder.findMany({
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
      }) : Promise.resolve([]),
      isAdmin ? prisma.stocktakeSession.findFirst({
      where: { orgId: user.orgId, periodMonth, status: { not: 'cancelled' } },
      select: { id: true },
      }) : Promise.resolve(null),
      prisma.zaloAccount.findMany({
      where: { orgId: user.orgId },
      select: { id: true, displayName: true },
      }),
      prisma.order.findMany({
      where: {
      orgId: user.orgId,
      assignedSaleId: user.id,
      // Cả 'partial': khách/sale cần biết ngay khi có hoá đơn đầu tiên, không
      // đợi tới lúc xuất đủ tiền.
      vatInvoiceStatus: { in: ['issued', 'partial'] },
      vatIssuedAt: { gte: sevenDaysAgo },
      },
      select: {
      id: true, orderCode: true, vatInvoiceId: true, vatIssuedAt: true,
      vatInvoiceStatus: true, vatIssuedAmount: true,
      },
      orderBy: { vatIssuedAt: 'desc' },
      take: 5,
      }),
    ]);


    const unreplied = unrepliedRes;
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

    const todayApts = todayAptsRes;
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

    const tmrApts = tmrAptsRes;
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
    const overdueDebtList = overdueDebtListRes;
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
    const expiringBatches = expiringBatchesRes;
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
      const overdueImports = overdueImportsRes;
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

    // 6c. Monthly stocktake reminder (nhắc kiểm kho) — owner/admin only.
    //     Shows for the whole month until a session is created for it, so the
    //     "kiểm 1 lần/tháng" cadence isn't missed. Persists once the month's
    //     session exists in any state except cancelled.
    if (isAdmin) {
      const thisMonthSession = thisMonthSessionRes;
      if (!thisMonthSession) {
        notifications.push({
          id: `stocktake-${periodMonth}`,
          type: 'info',
          priority: 'medium',
          title: `Đến kỳ kiểm kho tháng ${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`,
          detail: 'Chưa có phiên kiểm kho tháng này — vào Quản lý kho › Kiểm kho để tạo phiên.',
          createdAt: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
        });
      }
    }

    // 6. Disconnected Zalo accounts
    const accounts = accountsRes;
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

    // 7. Hoá đơn VAT vừa xuất cho ĐƠN CỦA MÌNH (24/8/2026)
    // Kế toán xuất trên phần mềm ngoài rồi đánh dấu trong sale-app → báo lại cho
    // đúng sale phụ trách đơn. Cố ý lọc `assignedSaleId = user.id` kể cả với
    // admin: đây là tin của người bán, không phải bảng theo dõi toàn công ty.
    const justIssued = justIssuedRes;
    for (const o of justIssued) {
      const partial = o.vatInvoiceStatus === 'partial';
      notifications.push({
        id: `vat-issued-${o.id}`,
        type: 'success',
        priority: 'normal',
        title: partial
          ? `Đã xuất một phần hoá đơn VAT cho đơn ${o.orderCode}`
          : `Đã xuất hoá đơn VAT cho đơn ${o.orderCode}`,
        detail: [
          o.vatInvoiceId ? `Số hoá đơn: ${o.vatInvoiceId}` : 'Kế toán đã phát hành hoá đơn',
          partial ? `Đã xuất ${(o.vatIssuedAmount ?? 0).toLocaleString('vi-VN')}đ` : '',
        ]
          .filter(Boolean)
          .join(' · '),
        createdAt: (o.vatIssuedAt ?? new Date()).toISOString(),
      });
    }

    return { notifications };
  });
}
