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
  // Fallback models for better reliability
  private fallbackModels: string[] = [
    'llama-3.3-70b-versatile',  // Primary: best tool support, 131K context
    'llama3-70b-8192',          // Secondary: stable alternative
    'gemma2-9b-it',             // Tertiary: smaller, faster fallback
  ];
  private currentModelIndex: number = 0;
  private currentModel: string = this.fallbackModels[0];
  private models: GroqModel[] = [];

  constructor(apiKey: string, model?: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
      timeout: 360000,
    });
    if (model) {
      this.currentModel = model;
      // If a specific model is provided, add it to the beginning of fallback list
      if (!this.fallbackModels.includes(model)) {
        this.fallbackModels.unshift(model);
      }
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
    let lastError: any;
    const startIndex = model ? 0 : this.currentModelIndex;

    // Try each fallback model
    for (let i = startIndex; i < this.fallbackModels.length; i++) {
      const modelToUse = model || this.fallbackModels[i];
      
      try {
        const response = await this.client.chat.completions.create({
          model: modelToUse,
          messages,
          tools: tools && tools.length > 0 ? tools : undefined,
          tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
          temperature: 0.7,
          max_tokens: 4000,
        });

        // If successful, update current model and index
        if (!model) {
          this.currentModel = modelToUse;
          this.currentModelIndex = i;
        }

        return response as GroqResponse;
      } catch (error: any) {
        lastError = error;
        
        // Check if this is a tool call validation error
        if (error.message?.includes('tool call validation failed') && i < this.fallbackModels.length - 1) {
          console.error(`Model ${modelToUse} returned malformed tool calls. Trying next model...`);
          continue;
        }
        
        // Check if model is deprecated
        if (error.message?.includes('decommissioned') && i < this.fallbackModels.length - 1) {
          console.error(`Model ${modelToUse} is deprecated. Trying next model...`);
          continue;
        }

        // For other errors or if this is the last model, throw
        if (i === this.fallbackModels.length - 1) {
          throw new Error(`Groq API error after trying all models: ${error.message}`);
        }
      }
    }

    throw new Error(`Groq API error: ${lastError?.message || 'Unknown error'}`);
  }

  async *chatStream(
    messages: GroqMessage[],
    tools?: GroqTool[],
    model?: string
  ): AsyncGenerator<any, void, unknown> {
    let lastError: any;
    const startIndex = model ? 0 : this.currentModelIndex;

    // Try each fallback model
    for (let i = startIndex; i < this.fallbackModels.length; i++) {
      const modelToUse = model || this.fallbackModels[i];
      
      try {
        const stream = await this.client.chat.completions.create({
          model: modelToUse,
          messages,
          tools: tools && tools.length > 0 ? tools : undefined,
          tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
          temperature: 0.7,
          max_tokens: 4000,
          stream: true,
        });

        // If we get here, the model is working
        if (!model) {
          this.currentModel = modelToUse;
          this.currentModelIndex = i;
        }

        for await (const chunk of stream) {
          yield chunk;
        }
        
        return; // Success, exit the function
      } catch (error: any) {
        lastError = error;
        
        // Check if this is a tool call validation error or deprecation
        if ((error.message?.includes('tool call validation failed') || 
             error.message?.includes('decommissioned')) && 
            i < this.fallbackModels.length - 1) {
          console.error(`Model ${modelToUse} failed. Trying next model...`);
          continue;
        }

        // For other errors or if this is the last model, throw
        if (i === this.fallbackModels.length - 1) {
          throw new Error(`Groq API error after trying all models: ${error.message}`);
        }
      }
    }

    throw new Error(`Groq API error: ${lastError?.message || 'Unknown error'}`);
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

  getFallbackModels(): string[] {
    return [...this.fallbackModels];
  }

  getCurrentModelIndex(): number {
    return this.currentModelIndex;
  }
}