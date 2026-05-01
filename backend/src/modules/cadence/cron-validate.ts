/**
 * cron-validate.ts — wraps cron-parser for admin-side validation only.
 *
 * The runtime cron job (task-cron.ts) keeps its own light-weight parser
 * — we don't swap it out, just gate admin saves through the canonical
 * library so invalid expressions are caught before they're persisted.
 */
import { CronExpressionParser } from 'cron-parser';

export interface CronValidationResult {
  valid: boolean;
  error?: string;
  /** Next 3 fire times in ISO format, for the admin to sanity-check. */
  nextRuns?: string[];
}

export function validateCron(expression: string): CronValidationResult {
  try {
    const interval = CronExpressionParser.parse(expression, {
      tz: 'Asia/Ho_Chi_Minh',
    });
    const nextRuns: string[] = [];
    for (let i = 0; i < 3; i++) {
      const iso = interval.next().toISOString();
      if (iso) nextRuns.push(iso);
    }
    return { valid: true, nextRuns };
  } catch (err: any) {
    return { valid: false, error: err?.message ?? 'Cron expression không hợp lệ' };
  }
}
