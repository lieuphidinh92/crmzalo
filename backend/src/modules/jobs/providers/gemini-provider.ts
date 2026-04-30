/**
 * Gemini (Google) AI provider implementation.
 * Uses @google/generative-ai for chat analysis.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIProvider, AIResponse } from '../ai-provider.js';

export class GeminiProvider implements AIProvider {
  private model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>;
  private modelName: string;

  constructor(apiKey: string, model = 'gemini-2.0-flash') {
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ model });
    this.modelName = model;
  }

  async analyzeChat(systemPrompt: string, transcript: string): Promise<AIResponse> {
    const result = await this.model.generateContent({
      systemInstruction: systemPrompt,
      contents: [{ role: 'user', parts: [{ text: transcript }] }],
    });

    const response = result.response;
    const text = response.text();
    const usage = response.usageMetadata;

    return {
      content: text,
      inputTokens: usage?.promptTokenCount || 0,
      outputTokens: usage?.candidatesTokenCount || 0,
      model: this.modelName,
      provider: 'gemini',
    };
  }
}
