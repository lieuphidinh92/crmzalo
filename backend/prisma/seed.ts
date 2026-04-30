/**
 * Database seed script.
 * Reads ICD-10 disease codes from the markdown file at ../../idea/danhmucbenhicd.md
 * and upserts them into the icd10_codes table.
 *
 * Run with: npm run db:seed
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

interface Icd10Entry {
  code: string;
  nameVi: string;
  category: string;
}

/**
 * Parse ICD-10 codes from markdown table format.
 * Handles:
 *  - Category header rows:  | **II** | **BƯỚU TÂN SINH** | |
 *  - Data rows:             | 1 | Disease name | A06 |
 *  - Code ranges:           "A15 đến A19"
 *  - Multiple codes:        "B92, A30"
 */
function parseIcd10Markdown(content: string): Icd10Entry[] {
  const lines = content.split('\n');
  const codes: Icd10Entry[] = [];
  let currentCategory = '';

  for (const line of lines) {
    // Detect category header rows (bold Roman numeral + bold title)
    const categoryMatch = line.match(/\|\s*\*\*[IVX]+\*\*\s*\|\s*\*\*(.+?)\*\*\s*\|/);
    if (categoryMatch) {
      currentCategory = categoryMatch[1].trim();
      continue;
    }

    // Detect data rows: | number | disease name | code(s) |
    const dataMatch = line.match(/\|\s*\d+\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
    if (!dataMatch) continue;

    const nameVi = dataMatch[1].trim();
    const codeStr = dataMatch[2].trim();

    // Skip placeholder values
    if (codeStr === '(Theo chẩn đoán)' || !codeStr) continue;

    if (codeStr.includes('đến') || codeStr.includes('to')) {
      // Range like "A15 đến A19" — store both boundary codes
      const parts = codeStr.split(/\s+(?:đến|to)\s+/);
      if (parts.length === 2) {
        codes.push({ code: parts[0].trim(), nameVi, category: currentCategory });
        codes.push({ code: parts[1].trim(), nameVi, category: currentCategory });
      }
    } else if (codeStr.includes(',')) {
      // Multiple codes like "B92, A30"
      for (const c of codeStr.split(',')) {
        const trimmed = c.trim();
        if (trimmed && trimmed !== '(Theo chẩn đoán)') {
          codes.push({ code: trimmed, nameVi, category: currentCategory });
        }
      }
    } else {
      codes.push({ code: codeStr, nameVi, category: currentCategory });
    }
  }

  return codes;
}

async function seedIcd10(): Promise<void> {
  const filePath = resolve('../../idea/danhmucbenhicd.md');

  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    console.log(`ICD-10 file not found at ${filePath} — skipping seed`);
    return;
  }

  const codes = parseIcd10Markdown(content);
  console.log(`Found ${codes.length} ICD-10 codes to seed`);

  let upserted = 0;
  for (const item of codes) {
    try {
      await prisma.icd10Code.upsert({
        where: { code: item.code },
        update: { nameVi: item.nameVi, category: item.category },
        create: { code: item.code, nameVi: item.nameVi, category: item.category },
      });
      upserted++;
    } catch (err) {
      console.warn(`Skipped code "${item.code}":`, err);
    }
  }

  console.log(`ICD-10 seed complete — ${upserted}/${codes.length} records upserted`);
}

async function main(): Promise<void> {
  await seedIcd10();
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
