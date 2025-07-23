import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat';

export type GroqMessage = ChatCompletionMessageParam;

export interface GroqTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required: string[];
    };
  };
}

export interface GroqToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface GroqResponse {
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: GroqToolCall[];
    };
    finish_reason: string;
  }>;
}

export interface GroqModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export class GroqClient {
  private client: OpenAI;
  // llama-3.3-70b-versatile has excellent tool support and 131K context
  private currentModel: string = 'llama-3.3-70b-versatile';
  private models: GroqModel[] = [];

  constructor(apiKey: string, model?: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
      timeout: 360000,
    });
    if (model) {
      this.currentModel = model;
    }
  }

  setModel(model: string): void {
    this.currentModel = model;
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  async chat(
    messages: GroqMessage[],
    tools?: GroqTool[],
    model?: string
  ): Promise<GroqResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: model || this.currentModel,
        messages,
        tools: tools && tools.length > 0 ? tools : undefined,
        tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
        temperature: 0.7,
        max_tokens: 4000,
      });

      return response as GroqResponse;
    } catch (error: any) {
      throw new Error(`Groq API error: ${error.message}`);
    }
  }

  async *chatStream(
    messages: GroqMessage[],
    tools?: GroqTool[],
    model?: string
  ): AsyncGenerator<any, void, unknown> {
    try {
      const stream = await this.client.chat.completions.create({
        model: model || this.currentModel,
        messages,
        tools: tools && tools.length > 0 ? tools : undefined,
        tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
        temperature: 0.7,
        max_tokens: 4000,
        stream: true,
      });

      for await (const chunk of stream) {
        yield chunk;
      }
    } catch (error: any) {
      throw new Error(`Groq API error: ${error.message}`);
    }
  }

  async fetchModels(): Promise<GroqModel[]> {
    try {
      const response = await this.client.models.list();
      this.models = response.data as GroqModel[];
      return this.models;
    } catch (error: any) {
      throw new Error(`Failed to fetch models: ${error.message}`);
    }
  }

  getModels(): GroqModel[] {
    return this.models;
  }
}