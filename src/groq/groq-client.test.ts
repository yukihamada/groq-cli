import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GroqClient } from './groq-client';
import OpenAI from 'openai';

vi.mock('openai');

describe('GroqClient', () => {
  let groqClient: GroqClient;
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    vi.clearAllMocks();
    groqClient = new GroqClient(mockApiKey);
  });

  describe('constructor', () => {
    it('should initialize with provided API key', () => {
      expect(groqClient).toBeDefined();
      expect(groqClient.getCurrentModel()).toBe('llama-3.3-70b-versatile');
    });

    it('should initialize with custom model', () => {
      const customModel = 'llama-3.2-90b-text-preview';
      const client = new GroqClient(mockApiKey, customModel);
      expect(client.getCurrentModel()).toBe(customModel);
    });
  });

  describe('setModel', () => {
    it('should update the current model', () => {
      const newModel = 'mixtral-8x7b-32768';
      groqClient.setModel(newModel);
      expect(groqClient.getCurrentModel()).toBe(newModel);
    });
  });

  describe('chat', () => {
    it('should call OpenAI chat completions with correct parameters', async () => {
      const mockResponse = {
        choices: [{
          message: {
            role: 'assistant',
            content: 'Test response',
            tool_calls: undefined
          },
          finish_reason: 'stop'
        }]
      };

      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      (OpenAI as any).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate
          }
        }
      }));

      const client = new GroqClient(mockApiKey);
      const messages = [{ role: 'user' as const, content: 'Hello' }];
      
      const response = await client.chat(messages);
      
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'llama-3.3-70b-versatile',
        messages,
        tools: undefined,
        tool_choice: undefined,
        temperature: 0.7,
        max_tokens: 4000
      });
      
      expect(response).toEqual(mockResponse);
    });

    it('should handle tools when provided', async () => {
      const mockCreate = vi.fn().mockResolvedValue({ choices: [] });
      (OpenAI as any).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate
          }
        }
      }));

      const client = new GroqClient(mockApiKey);
      const messages = [{ role: 'user' as const, content: 'Hello' }];
      const tools = [{
        type: 'function' as const,
        function: {
          name: 'test_tool',
          description: 'Test tool',
          parameters: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      }];
      
      await client.chat(messages, tools);
      
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'llama-3.3-70b-versatile',
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 4000
      });
    });

    it('should handle API errors', async () => {
      const mockError = new Error('API Error');
      const mockCreate = vi.fn().mockRejectedValue(mockError);
      (OpenAI as any).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate
          }
        }
      }));

      const client = new GroqClient(mockApiKey);
      const messages = [{ role: 'user' as const, content: 'Hello' }];
      
      await expect(client.chat(messages)).rejects.toThrow('Groq API error: API Error');
    });
  });

  describe('chatStream', () => {
    it('should stream responses', async () => {
      const mockChunks = [
        { choices: [{ delta: { content: 'Hello' } }] },
        { choices: [{ delta: { content: ' world' } }] }
      ];

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          for (const chunk of mockChunks) {
            yield chunk;
          }
        }
      };

      const mockCreate = vi.fn().mockResolvedValue(mockStream);
      (OpenAI as any).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate
          }
        }
      }));

      const client = new GroqClient(mockApiKey);
      const messages = [{ role: 'user' as const, content: 'Hello' }];
      
      const chunks: any[] = [];
      for await (const chunk of client.chatStream(messages)) {
        chunks.push(chunk);
      }
      
      expect(chunks).toEqual(mockChunks);
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'llama-3.3-70b-versatile',
        messages,
        tools: undefined,
        tool_choice: undefined,
        temperature: 0.7,
        max_tokens: 4000,
        stream: true
      });
    });
  });

  describe('fetchModels', () => {
    it('should fetch and return models', async () => {
      const mockModels = {
        data: [
          { id: 'model-1', object: 'model', created: 1234567890, owned_by: 'groq' },
          { id: 'model-2', object: 'model', created: 1234567891, owned_by: 'groq' }
        ]
      };

      const mockList = vi.fn().mockResolvedValue(mockModels);
      (OpenAI as any).mockImplementation(() => ({
        models: {
          list: mockList
        }
      }));

      const client = new GroqClient(mockApiKey);
      const models = await client.fetchModels();
      
      expect(mockList).toHaveBeenCalled();
      expect(models).toEqual(mockModels.data);
      expect(client.getModels()).toEqual(mockModels.data);
    });

    it('should handle fetch errors', async () => {
      const mockError = new Error('Network error');
      const mockList = vi.fn().mockRejectedValue(mockError);
      (OpenAI as any).mockImplementation(() => ({
        models: {
          list: mockList
        }
      }));

      const client = new GroqClient(mockApiKey);
      
      await expect(client.fetchModels()).rejects.toThrow('Failed to fetch models: Network error');
    });
  });
});