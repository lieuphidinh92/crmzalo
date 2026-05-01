/**
 * learning-seeds.ts — idempotent first-run seeds for LearningModule.
 *
 * Three sample modules per org so the page renders something on first
 * visit. Admin can edit/disable from the Cadence Settings page.
 */
import { prisma } from '../../shared/database/prisma-client.js';

interface ModuleSeed {
  name: string;
  description: string;
  type: 'required' | 'optional';
  contentUrl: string;
  durationMinutes: number;
  forRoles: string[];
  sortOrder: number;
}

const MODULE_SEEDS: ModuleSeed[] = [
  {
    name: 'Quy trình bán sỉ TPCN cho người mới',
    description: 'Khoá nhập môn 8 phút: phân loại đại lý, kịch bản chào hàng cơ bản, cách xử lý phản đối phổ biến.',
    type: 'required',
    contentUrl: 'https://www.youtube.com/watch?v=LXb3EKWsInQ',
    durationMinutes: 8,
    forRoles: ['member'],
    sortOrder: 1,
  },
  {
    name: 'Đọc báo cáo Resale & Pipeline',
    description: 'Hướng dẫn admin/owner cách đọc các chỉ số chính trên Dashboard CEO + Báo cáo Resale.',
    type: 'required',
    contentUrl: 'https://www.youtube.com/watch?v=Vy3OkbtUa5s',
    durationMinutes: 12,
    forRoles: ['admin', 'owner'],
    sortOrder: 2,
  },
  {
    name: 'Xử lý phản đối "đắt quá" cho khách sỉ',
    description: 'Tham khảo cách trả lời 5 phản đối thường gặp về giá khi tư vấn sỉ TPCN.',
    type: 'optional',
    contentUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    durationMinutes: 6,
    forRoles: ['member', 'admin', 'owner'],
    sortOrder: 3,
  },
];

export async function ensureLearningModulesSeeded(orgId: string): Promise<void> {
  const existing = await prisma.learningModule.findMany({
    where: { orgId },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((m) => m.name));

  for (const seed of MODULE_SEEDS) {
    if (existingNames.has(seed.name)) continue;
    await prisma.learningModule.create({
      data: {
        orgId,
        name: seed.name,
        description: seed.description,
        type: seed.type,
        contentUrl: seed.contentUrl,
        durationMinutes: seed.durationMinutes,
        forRoles: seed.forRoles as object,
        sortOrder: seed.sortOrder,
        active: true,
      },
    });
  }
}
