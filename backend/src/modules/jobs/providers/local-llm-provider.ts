/**
 * Local LLM provider — OpenAI-compatible API (e.g. qwen3-coder via ai.ngay.top).
 * Uses openai npm package pointed at a custom base URL.
 */
import OpenAI from 'openai';
import type { AIProvider, AIResponse } from '../ai-provider.js';

export class LocalProvider implements AIProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, baseURL: string, model = 'qwen3-coder:latest') {
    this.client = new OpenAI({
      apiKey,
      baseURL,
      defaultHeaders: {
        'User-Agent': 'ZaloCRM/1.0',
      },
    });
    this.model = model;
  }

  async analyzeChat(systemPrompt: string, transcript: string): Promise<AIResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: transcript },
      ],
      max_tokens: 4096,
      temperature: 0.3,
    });

    const text = response.choices[0]?.message?.content || '';
    const usage = response.usage;

    return {
      content: text,
      inputTokens: usage?.prompt_tokens || 0,
      outputTokens: usage?.completion_tokens || 0,
      model: this.model,
      provider: 'local',
    };
  }
}
