/**
 * Builds system prompts for each job type (qc, classify, generic).
 * Extracted from analyzer to keep files under 200 lines.
 */

export function buildSystemPrompt(jobType: string, rulesContent: string): string {
  if (jobType === 'qc') {
    return `Bạn là chuyên gia đánh giá chất lượng chăm sóc khách hàng trong lĩnh vực y tế.
Phân tích cuộc trò chuyện và đánh giá chất lượng CSKH.

${rulesContent ? `Quy tắc đánh giá:\n${rulesContent}\n` : ''}

Trả về JSON:
{
  "verdict": "PASS" hoặc "FAIL",
  "score": 0-100,
  "review": "nhận xét chi tiết",
  "violations": [{"rule": "tên quy tắc", "evidence": "bằng chứng", "severity": "high/medium/low"}],
  "summary": "tóm tắt ngắn"
}`;
  }

  if (jobType === 'classify') {
    return `Bạn là chuyên gia phân loại cuộc trò chuyện trong lĩnh vực y tế/phòng khám.
Phân loại cuộc trò chuyện theo chủ đề.

${rulesContent ? `Danh mục phân loại:\n${rulesContent}\n` : `Phân loại: hỏi giá, tái khám, khiếu nại, mua thuốc, tư vấn bệnh, hẹn lịch, khác`}

Trả về JSON:
{
  "category": "chủ đề chính",
  "confidence": 0.0-1.0,
  "summary": "tóm tắt nội dung",
  "tags": ["tag1", "tag2"]
}`;
  }

  return `Phân tích cuộc trò chuyện và trả về JSON với nhận xét.\n${rulesContent}`;
}

export function formatTranscript(
  messages: Array<{ senderType: string; sentAt: Date; content: string | null }>,
  contactName: string,
): string {
  return messages
    .map(m => {
      const sender = m.senderType === 'self' ? 'Nhân viên' : contactName || 'Khách hàng';
      return `[${new Date(m.sentAt).toLocaleTimeString('vi-VN')}] ${sender}: ${m.content || '(media)'}`;
    })
    .join('\n');
}

export function parseAIContent(raw: string): any {
  let content = raw.trim();
  // Strip markdown code fences
  if (content.startsWith('```')) {
    content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  try {
    return JSON.parse(content);
  } catch {
    return { raw, parseError: true };
  }
}
