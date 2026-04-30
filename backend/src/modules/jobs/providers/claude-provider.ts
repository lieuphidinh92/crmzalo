/**
 * Claude (Anthropic) AI provider implementation.
 * Uses @anthropic-ai/sdk for chat analysis.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, AIResponse } from '../ai-provider.js';

export class ClaudeProvider implements AIProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model = 'claude-sonnet-4-20250514') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async analyzeChat(systemPrompt: string, transcript: string): Promise<AIResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: transcript }],
    });

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('');

    return {
      content: text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model: this.model,
      provider: 'claude',
    };
  }
}
