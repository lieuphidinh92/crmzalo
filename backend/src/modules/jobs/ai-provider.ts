/**
 * AI provider interface and response types.
 * All providers implement analyzeChat to enable swappable AI backends.
 */
export interface AIResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: string; // 'claude' | 'gemini' | 'local'
}

export interface AIProvider {
  analyzeChat(systemPrompt: string, transcript: string): Promise<AIResponse>;
}
