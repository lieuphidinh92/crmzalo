/**
 * Main application entry point.
 * Bootstraps Fastify server with all plugins, Socket.IO, and route handlers.
 * The process never exits — all errors are caught and logged.
 */
import './set-timezone.js'; // PHẢI đứng đầu: ép giờ VN trước mọi module dùng Date
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import { Server } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import prismaPkg from '@prisma/client';
const { Prisma } = prismaPkg;
import { config } from './config/index.js';
import { prisma } from './shared/database/prisma-client.js';
import { logger } from './shared/utils/logger.js';
import { authRoutes } from './modules/auth/auth-routes.js';
import { zaloRoutes } from './modules/zalo/zalo-routes.js';
import { chatRoutes } from './modules/chat/chat-routes.js';
import { contactRoutes } from './modules/contacts/contact-routes.js';
import { contactSubResourceRoutes } from './modules/contacts/contact-sub-resource-routes.js';
import { contactAiInsightRoutes } from './modules/contacts/contact-ai-insight-routes.js';
import { contactCareRoutes } from './modules/contacts/contact-care-routes.js';
import { appointmentRoutes } from './modules/contacts/appointment-routes.js';
import { startCustomerRankCron } from './modules/contacts/customer-rank-cron.js';
import { startAppointmentReminder } from './modules/contacts/appointment-reminder.js';
import { dashboardRoutes } from './modules/dashboard/dashboard-routes.js';
import { reportRoutes } from './modules/dashboard/report-routes.js';
import { resaleReportRoutes } from './modules/reports/resale-routes.js';
import { pipelineRoutes } from './modules/reports/pipeline-routes.js';
import { ceoDashboardRoutes } from './modules/dashboard/ceo-routes.js';
import { businessGoalsRoutes } from './modules/settings/business-goals-routes.js';
import { salePerformanceRoutes } from './modules/dashboard/sale-performance-routes.js';
import { saleScoreConfigRoutes } from './modules/settings/sale-score-config-routes.js';
import { personalDashboardRoutes } from './modules/dashboard/personal-dashboard-routes.js';
import { adminDashboardRoutes } from './modules/dashboard/admin-dashboard-routes.js';
import { taskRoutes } from './modules/tasks/task-routes.js';
import { startTaskCronJobs } from './modules/tasks/task-cron.js';
import { userRoutes } from './modules/auth/user-routes.js';
import { teamRoutes } from './modules/auth/team-routes.js';
import { orgRoutes } from './modules/auth/org-routes.js';
import { zaloAccessRoutes } from './modules/zalo/zalo-access-routes.js';
import { zaloSyncRoutes } from './modules/zalo/zalo-sync-routes.js';
import { zaloPool } from './modules/zalo/zalo-pool.js';
import { registerZaloSocketHandlers } from './modules/zalo/zalo-socket.js';
import { jobRoutes } from './modules/jobs/job-routes.js';
import { aiSettingsRoutes } from './modules/jobs/ai-settings-routes.js';
import { startJobScheduler } from './modules/jobs/job-scheduler.js';
import { startDailyStatsAggregation } from './modules/jobs/daily-stats.js';
import { notificationRoutes } from './modules/notifications/notification-routes.js';
import { searchRoutes } from './modules/search/search-routes.js';
import { orderRoutes } from './modules/orders/order-routes.js';
import { orderTransitionRoutes } from './modules/orders/order-transitions.js';
import { orderItemsRoutes } from './modules/orders/order-items-routes.js';
import { orderGiftsRoutes } from './modules/orders/order-gifts-routes.js';
import { orderPaymentRoutes } from './modules/orders/order-payment-routes.js';
import { startOrderCronJobs } from './modules/orders/order-cron.js';
import { productRoutes } from './modules/products/product-routes.js';
import { brandRoutes } from './modules/products/brand-routes.js';
import { batchRoutes } from './modules/inventory/batch-routes.js';
import { inventoryReportRoutes } from './modules/inventory/inventory-reports.js';
import { inventoryAlertsRoutes } from './modules/inventory/alerts-routes.js';
import { stocktakeRoutes } from './modules/inventory/stocktake-routes.js';
import { startInventoryCronJobs } from './modules/inventory/inventory-cron.js';
import { importsRoutes } from './modules/imports/imports-routes.js';
import { supplierDebtRoutes } from './modules/imports/supplier-debt-routes.js';
import { startSupplierDebtCron } from './modules/imports/supplier-debt-cron.js';
import { startZaloHealthCheck } from './modules/zalo/zalo-health-check.js';
import { quickReplyRoutes } from './modules/quick-replies/quick-reply-routes.js';
import { learningRoutes } from './modules/learning/learning-routes.js';
import { cadenceRoutes } from './modules/cadence/cadence-routes.js';
import { pancakeWebhookRoutes } from './modules/webhooks/pancake-routes.js';
import { overviewReportRoutes } from './modules/reports/overview-routes.js';
import { saleAppRoutes } from './modules/sale-app/sale-app-routes.js';
import { debtRoutes } from './modules/sale-app/debt-routes.js';
import { followUpRoutes } from './modules/sale-app/follow-up-routes.js';
import { productEditRoutes } from './modules/sale-app/product-edit-routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function bootstrap() {
  const app = Fastify({ logger: false });

  // ── Plugins ──────────────────────────────────────────────────────────────

  await app.register(cors, {
    origin: config.isProduction ? config.appUrl : true,
    credentials: true,
  });

  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
  });

  await app.register(rateLimit, {
    max: 500,
    timeWindow: '1 minute',
  });

  // Excel upload for /imports/parse-excel — single .xlsx, max 5MB.
  await app.register(fastifyMultipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });

  // Serve compiled frontend assets in production
  if (config.isProduction) {
    await app.register(fastifyStatic, {
      root: path.join(__dirname, '../static'),
      prefix: '/',
    });
  }

  // ── Socket.IO ─────────────────────────────────────────────────────────────

  const io = new Server(app.server, {
    cors: {
      origin: config.isProduction ? config.appUrl : '*',
      credentials: true,
    },
  });

  // Attach io to app so route handlers can emit events
  app.decorate('io', io);

  // Pass io to zalo pool for real-time event emission
  zaloPool.setIO(io);

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);
    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${socket.id}`);
    });
  });

  // Register Zalo Socket.IO event handlers
  registerZaloSocketHandlers(io);

  // ── Routes ────────────────────────────────────────────────────────────────

  await app.register(authRoutes);
  await app.register(zaloRoutes);
  await app.register(chatRoutes);
  await app.register(contactRoutes);
  await app.register(contactSubResourceRoutes);
  await app.register(contactAiInsightRoutes);
  await app.register(contactCareRoutes);
  await app.register(appointmentRoutes);
  await app.register(dashboardRoutes);
  await app.register(reportRoutes);
  await app.register(resaleReportRoutes);
  await app.register(pipelineRoutes);
  await app.register(ceoDashboardRoutes);
  await app.register(salePerformanceRoutes);
  await app.register(businessGoalsRoutes);
  await app.register(saleScoreConfigRoutes);
  await app.register(personalDashboardRoutes);
  await app.register(adminDashboardRoutes);
  await app.register(taskRoutes);
  await app.register(userRoutes);
  await app.register(teamRoutes);
  await app.register(orgRoutes);
  await app.register(zaloAccessRoutes);
  await app.register(zaloSyncRoutes);
  await app.register(jobRoutes);
  await app.register(aiSettingsRoutes);
  await app.register(notificationRoutes);
  await app.register(searchRoutes);
  await app.register(orderRoutes);
  await app.register(orderTransitionRoutes);
  await app.register(orderItemsRoutes);
  await app.register(orderGiftsRoutes);
  await app.register(orderPaymentRoutes);
  await app.register(productRoutes);
  await app.register(brandRoutes);
  await app.register(batchRoutes);
  await app.register(inventoryReportRoutes);
  await app.register(inventoryAlertsRoutes);
  await app.register(stocktakeRoutes);
  await app.register(importsRoutes);
  await app.register(supplierDebtRoutes);
  await app.register(quickReplyRoutes);
  await app.register(learningRoutes);
  await app.register(cadenceRoutes);
  await app.register(pancakeWebhookRoutes);
  await app.register(overviewReportRoutes);
  await app.register(saleAppRoutes);
  await app.register(debtRoutes);
  await app.register(followUpRoutes);
  await app.register(productEditRoutes);

  // Liveness/readiness probe — also checks DB connectivity
  app.get('/health', async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'connected', timestamp: new Date().toISOString() };
    } catch {
      return { status: 'error', db: 'disconnected', timestamp: new Date().toISOString() };
    }
  });

  // API version banner + public-facing API discovery for external integrations
  app.get('/api/v1/status', async () => {
    return {
      version: '1.0.0',
      name: 'Zalo Sales CRM',
      publicUrl: config.publicUrl,
      integrations: {
        pancake: {
          endpoint: `${config.publicUrl}/api/webhooks/pancake`,
          method: 'POST',
          contentType: 'application/json',
          authHeader: 'X-Api-Key',
          envVar: 'PANCAKE_API_KEY',
          payloadShape: {
            conversation_id: 'string (optional, for idempotency)',
            customer_name: 'string (optional)',
            customer_phone: 'string (required, normalized)',
            facebook_id: 'string (optional)',
            page_id: 'string (optional)',
            first_message: 'string (optional, snippet)',
          },
        },
      },
    };
  });

  // SPA fallback — serve index.html for non-API routes in production
  if (config.isProduction) {
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({ error: 'not_found' });
      }
      return reply.sendFile('index.html');
    });
  }

  // ── Error handler ─────────────────────────────────────────────────────────

  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    logger.error('Request error:', error.message);
    reply.status(error.statusCode ?? 500).send({
      error: error.message || 'Internal Server Error',
    });
  });

  // ── Start ─────────────────────────────────────────────────────────────────

  try {
    await app.listen({ port: config.port, host: config.host });
    logger.info(`Zalo Sales CRM running on http://${config.host}:${config.port}`);
    logger.info(`Environment: ${config.nodeEnv}`);
    startAppointmentReminder(io);
    startJobScheduler().catch(err => logger.error('Job scheduler start failed:', err));
    startDailyStatsAggregation();
    startZaloHealthCheck();
    startTaskCronJobs();
    startOrderCronJobs();
    startInventoryCronJobs();
    startCustomerRankCron();
    startSupplierDebtCron();
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }

  // Reconnect Zalo accounts that have saved sessions
  try {
    const accounts = await prisma.zaloAccount.findMany({
      where: { sessionData: { not: Prisma.JsonNull } },
      select: { id: true, sessionData: true },
    });
    logger.info(`Attempting reconnect for ${accounts.length} Zalo account(s)`);
    for (const account of accounts) {
      const session = account.sessionData as {
        cookie: any;
        imei: string;
        userAgent: string;
      } | null;
      if (session?.imei) {
        zaloPool.reconnect(account.id, session).catch((err) => {
          logger.warn(`Auto-reconnect failed for account ${account.id}:`, err);
        });
      }
    }
  } catch (err) {
    logger.error('Failed to load accounts for reconnect:', err);
  }
}

// Keep process alive — log but never crash on unhandled errors
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

bootstrap();
