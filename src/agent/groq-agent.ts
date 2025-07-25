import { GroqClient, GroqMessage, GroqToolCall } from "../groq/groq-client";
import { GROQ_TOOLS } from "../groq/groq-tools";
import { TextEditorTool, BashTool, TodoTool, ConfirmationTool, WebTool, WebSearchTool } from "../tools";
import { ToolResult } from "../types";
import { EventEmitter } from "events";
import { createTokenCounter, TokenCounter } from "../utils/token-counter";
import { loadCustomInstructions } from "../utils/custom-instructions";
import { SessionManager, Session } from "../utils/session-manager";

export interface ChatEntry {
  type: "user" | "assistant" | "tool_result";
  content: string;
  timestamp: Date;
  toolCalls?: GroqToolCall[];
  toolCall?: GroqToolCall;
  toolResult?: { success: boolean; output?: string; error?: string };
  isStreaming?: boolean;
}

export interface StreamingChunk {
  type: "content" | "tool_calls" | "tool_result" | "done" | "token_count";
  content?: string;
  toolCalls?: GroqToolCall[];
  toolCall?: GroqToolCall;
  toolResult?: ToolResult;
  tokenCount?: number;
}

export class GroqAgent extends EventEmitter {
  private groqClient: GroqClient;
  private textEditor: TextEditorTool;
  private bash: BashTool;
  private todoTool: TodoTool;
  private confirmationTool: ConfirmationTool;
  private webTool: WebTool;
  private webSearchTool: WebSearchTool;
  private chatHistory: ChatEntry[] = [];
  private messages: GroqMessage[] = [];
  private tokenCounter: TokenCounter;
  private abortController: AbortController | null = null;
  private sessionManager: SessionManager | null = null;
  private currentSession: Session | null = null;
  private simpleMode: boolean = false;

  constructor(apiKey: string, simpleMode: boolean = false) {
    super();
    this.simpleMode = simpleMode;
    this.groqClient = new GroqClient(apiKey);
    this.textEditor = new TextEditorTool();
    this.bash = new BashTool();
    this.todoTool = new TodoTool();
    this.confirmationTool = new ConfirmationTool();
    this.webTool = new WebTool();
    this.webSearchTool = new WebSearchTool();
    this.tokenCounter = createTokenCounter(this.groqClient.getCurrentModel());

    // Load custom instructions
    const customInstructions = loadCustomInstructions();
    const customInstructionsSection = customInstructions
      ? `\n\nCUSTOM INSTRUCTIONS:\n${customInstructions}\n\nThe above custom instructions should be followed alongside the standard instructions below.`
      : "";

    // Initialize with system message
    const systemContent = this.simpleMode 
      ? `You are Groq CLI, an AI assistant powered by Groq's fast inference.${customInstructionsSection}

You are running in simple mode without access to tools. Focus on providing helpful, accurate responses based on your knowledge.

Current working directory: ${process.cwd()}`
      : `You are Groq CLI, an AI assistant that helps with file editing, coding tasks, and system operations.${customInstructionsSection}

CRITICAL: When using tools, you MUST follow the exact format specified. Never combine tool names with parameters in a single string.

You have access to these tools:
- view_file: View file contents or directory listings
- create_file: Create new files with content (ONLY use this for files that don't exist yet)
- str_replace_editor: Replace text in existing files (ALWAYS use this to edit or update existing files)
- bash: Execute bash commands (use for searching, file discovery, navigation, and system operations)
- create_todo_list: Create a visual todo list for planning and tracking tasks
- update_todo_list: Update existing todos in your todo list
- web_fetch: Fetch content from specific URLs (web pages, APIs, etc.)
- web_search: Search the web for current information when needed

IMPORTANT TOOL USAGE RULES:
- NEVER use create_file on files that already exist - this will overwrite them completely
- ALWAYS use str_replace_editor to modify existing files, even for small changes
- Before editing a file, use view_file to see its current contents
- Use create_file ONLY when creating entirely new files that don't exist

SEARCHING AND EXPLORATION:
- Use bash with commands like 'find', 'grep', 'rg' (ripgrep), 'ls', etc. for searching files and content
- Examples: 'find . -name "*.js"', 'grep -r "function" src/', 'rg "import.*react"'
- Use bash for directory navigation, file discovery, and content searching
- view_file is best for reading specific files you already know exist

When a user asks you to edit, update, modify, or change an existing file:
1. First use view_file to see the current contents
2. Then use str_replace_editor to make the specific changes
3. Never use create_file for existing files

When a user asks you to create a new file that doesn't exist:
1. Use create_file with the full content

WEB SEARCH GUIDANCE:
- Use web_search when users ask about current events, latest information, or topics beyond your knowledge cutoff
- Keywords that indicate web search: "latest", "current", "news", "today", "recent", "2024", "2025", etc.
- For specific website content, use web_fetch with the exact URL
- For general information searches, use web_search to find relevant sources

TASK PLANNING WITH TODO LISTS:
- For complex requests with multiple steps, ALWAYS create a todo list first to plan your approach
- Use create_todo_list to break down tasks into manageable items with priorities
- Mark tasks as 'in_progress' when you start working on them (only one at a time)
- Mark tasks as 'completed' immediately when finished
- Use update_todo_list to track your progress throughout the task
- Todo lists provide visual feedback with colors: ✅ Green (completed), 🔄 Cyan (in progress), ⏳ Yellow (pending)
- Always create todos with priorities: 'high' (🔴), 'medium' (🟡), 'low' (🟢)

USER CONFIRMATION SYSTEM:
File operations (create_file, str_replace_editor) and bash commands will automatically request user confirmation before execution. The confirmation system will show users the actual content or command before they decide. Users can choose to approve individual operations or approve all operations of that type for the session.

If a user rejects an operation, the tool will return an error and you should not proceed with that specific operation.

Be helpful, direct, and efficient. Always explain what you're doing and show the results.

IMPORTANT RESPONSE GUIDELINES:
- After using tools, do NOT respond with pleasantries like "Thanks for..." or "Great!"
- Only provide necessary explanations or next steps if relevant to the task
- Keep responses concise and focused on the actual work being done
- If a tool execution completes the user's request, you can remain silent or give a brief confirmation

Current working directory: ${process.cwd()}`;
    
    this.messages.push({
      role: "system",
      content: systemContent,
    });
  }

  private needsWebSearch(message: string): boolean {
    const webSearchKeywords = [
      'latest', 'current', 'news', 'today', 'recent',
      '2024', '2025', 'search for', 'find information about',
      'what is happening', 'update on', 'trending'
    ];
    
    const lowerMessage = message.toLowerCase();
    return webSearchKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  async processUserMessage(message: string): Promise<ChatEntry[]> {
    // Preprocess message for better tool usage with Japanese input
    let processedMessage = message;
    
    // Common Japanese patterns that might cause issues
    if (message.includes("何がある") || message.includes("プロジェクト") || message.includes("ファイル")) {
      // Add explicit instruction for listing files
      processedMessage = message + "\n\nPlease use the bash tool with appropriate commands like 'ls' or 'find' to explore the directory structure.";
    }
    
    // Add user message to conversation
    const userEntry: ChatEntry = {
      type: "user",
      content: message,
      timestamp: new Date(),
    };
    this.chatHistory.push(userEntry);
    const userMessage = { role: "user" as const, content: processedMessage };
    this.messages.push(userMessage);
    await this.saveToSession(userMessage);

    const newEntries: ChatEntry[] = [userEntry];
    const maxToolRounds = 10; // Prevent infinite loops
    let toolRounds = 0;

    try {
      let currentResponse = await this.groqClient.chat(
        this.messages,
        this.simpleMode ? undefined : GROQ_TOOLS
      );

      // Agent loop - continue until no more tool calls or max rounds reached
      while (toolRounds < maxToolRounds) {
        const assistantMessage = currentResponse.choices[0]?.message;

        if (!assistantMessage) {
          throw new Error("No response from Groq");
        }

        // Try to parse malformed tool calls from content if no proper tool_calls
        if (!assistantMessage.tool_calls && assistantMessage.content) {
          const parsedCalls = this.parseTextToolCalls(assistantMessage.content);
          if (parsedCalls) {
            console.log(`Parsed malformed tool call from content: ${assistantMessage.content}`);
            assistantMessage.tool_calls = parsedCalls;
          }
        }

        // Handle tool calls
        if (
          assistantMessage.tool_calls &&
          assistantMessage.tool_calls.length > 0
        ) {
          toolRounds++;
          

          // Add assistant message with tool calls
          // Clean up any malformed function call syntax in content
          let cleanContent = assistantMessage.content || "";
          // Remove any XML-style function tags
          cleanContent = cleanContent.replace(/<function[^>]*>.*?<\/function>/gs, '');
          cleanContent = cleanContent.replace(/<function[^>]*>/g, '');
          cleanContent = cleanContent.trim();
          
          const assistantEntry: ChatEntry = {
            type: "assistant",
            content: cleanContent || (assistantMessage.tool_calls ? "Using tools to help you..." : ""),
            timestamp: new Date(),
            toolCalls: assistantMessage.tool_calls,
          };
          this.chatHistory.push(assistantEntry);
          newEntries.push(assistantEntry);

          // Add assistant message to conversation
          const assistantMsg = {
            role: "assistant" as const,
            content: assistantMessage.content || "",
            tool_calls: assistantMessage.tool_calls?.map(tc => ({
              id: tc.id,
              type: 'function' as const,
              function: tc.function
            })),
          } as any;
          this.messages.push(assistantMsg);
          await this.saveToSession(assistantMsg);

          // Execute tool calls
          for (const toolCall of assistantMessage.tool_calls) {
            const result = await this.executeTool(toolCall);

            const toolResultEntry: ChatEntry = {
              type: "tool_result",
              content: result.success
                ? result.output || "Success"
                : result.error || "Error occurred",
              timestamp: new Date(),
              toolCall: toolCall,
              toolResult: result,
            };
            this.chatHistory.push(toolResultEntry);
            newEntries.push(toolResultEntry);

            // Add tool result to messages with proper format (needed for AI context)
            const toolMsg = {
              role: "tool" as const,
              content: result.success
                ? result.output || "Success"
                : result.error || "Error",
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
            } as any;
            this.messages.push(toolMsg);
            await this.saveToSession(toolMsg);
          }

          // Get next response - this might contain more tool calls
          currentResponse = await this.groqClient.chat(
            this.messages,
            this.simpleMode ? undefined : GROQ_TOOLS
          );
        } else {
          // No more tool calls, add final response
          const finalEntry: ChatEntry = {
            type: "assistant",
            content:
              assistantMessage.content ||
              "I understand, but I don't have a specific response.",
            timestamp: new Date(),
          };
          this.chatHistory.push(finalEntry);
          const finalMsg = {
            role: "assistant" as const,
            content: assistantMessage.content || "",
          };
          this.messages.push(finalMsg);
          await this.saveToSession(finalMsg);
          newEntries.push(finalEntry);
          break; // Exit the loop
        }
      }

      if (toolRounds >= maxToolRounds) {
        const warningEntry: ChatEntry = {
          type: "assistant",
          content:
            "Maximum tool execution rounds reached. Stopping to prevent infinite loops.",
          timestamp: new Date(),
        };
        this.chatHistory.push(warningEntry);
        newEntries.push(warningEntry);
      }

      return newEntries;
    } catch (error: any) {
      // Add more detailed error logging
      console.error("Error in processUserMessage:", error);
      
      // Check if this is a malformed tool call error
      let errorMessage = error.message;
      if (error.message.includes("tool call validation failed") && error.message.includes("which was not request.tools")) {
        errorMessage = "The AI model returned a malformed response. This can happen with certain prompts. Please try rephrasing your request or use simpler language.";
        console.error("Malformed tool call detected in response");
      } else if (error.message.includes("after trying all models")) {
        errorMessage = "All available models failed to process your request. The system tried multiple fallback models but encountered errors with each one.";
        console.error("All fallback models exhausted");
      }
      
      const errorEntry: ChatEntry = {
        type: "assistant",
        content: `Sorry, I encountered an error: ${errorMessage}`,
        timestamp: new Date(),
      };
      this.chatHistory.push(errorEntry);
      return [userEntry, errorEntry];
    }
  }

  private parseTextToolCalls(content: string): GroqToolCall[] | null {
    // Detect various malformed tool call patterns from Groq models
    const patterns = [
      /<function=([a-zA-Z_]\w*)\s*({[^}]+})/,           // <function=tool_name {...}>
      /<function\(([a-zA-Z_]\w*)\s*({[^}]+})\)/,        // <function(tool_name {...})
      /<function\\([a-zA-Z_]\w*)\s*({[^}]+})/,          // <function\tool_name{...}
      /^([a-zA-Z_]\w*)\(({[^}]+})\)/,                   // tool_name({...})
    ];
    
    for (const pattern of patterns) {
      const match = pattern.exec(content);
      if (match) {
        const toolName = match[1];
        let args = match[2];
        
        try {
          // Validate JSON
          JSON.parse(args);
          
          return [{
            id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'function',
            function: {
              name: toolName,
              arguments: args
            }
          }];
        } catch (e) {
          console.error(`Failed to parse tool arguments: ${args}`);
        }
      }
    }
    
    return null;
  }

  private messageReducer(previous: any, item: any): any {
    const reduce = (acc: any, delta: any) => {
      acc = { ...acc };
      for (const [key, value] of Object.entries(delta)) {
        if (acc[key] === undefined || acc[key] === null) {
          acc[key] = value;
          // Clean up index properties from tool calls
          if (Array.isArray(acc[key])) {
            for (const arr of acc[key]) {
              delete arr.index;
            }
          }
        } else if (typeof acc[key] === "string" && typeof value === "string") {
          // Don't concatenate if this is within a tool call function object
          if ((key === "name" || key === "arguments") && acc.type === "function") {
            // For function name and arguments, replace instead of concatenate
            acc[key] = value;
          } else {
            (acc[key] as string) += value;
          }
        } else if (Array.isArray(acc[key]) && Array.isArray(value)) {
          const accArray = acc[key] as any[];
          for (let i = 0; i < value.length; i++) {
            if (!accArray[i]) accArray[i] = {};
            accArray[i] = reduce(accArray[i], value[i]);
          }
        } else if (typeof acc[key] === "object" && typeof value === "object") {
          // Special handling for function objects within tool_calls
          if (key === "function" && acc[key] && value) {
            // Don't recursively reduce function objects - handle them specially
            const funcObj = acc[key] as any;
            const valueObj = value as any;
            if (valueObj.name !== undefined) funcObj.name = valueObj.name;
            if (valueObj.arguments !== undefined) {
              // Replace arguments instead of concatenating
              funcObj.arguments = valueObj.arguments;
            }
          } else {
            acc[key] = reduce(acc[key], value);
          }
        }
      }
      return acc;
    };

    const result = reduce(previous, item.choices[0]?.delta || {});
    
    
    return result;
  }

  async *processUserMessageStream(
    message: string
  ): AsyncGenerator<StreamingChunk, void, unknown> {
    // Create new abort controller for this request
    this.abortController = new AbortController();
    
    // Add user message to conversation
    const userEntry: ChatEntry = {
      type: "user",
      content: message,
      timestamp: new Date(),
    };
    this.chatHistory.push(userEntry);
    const userMessage = { role: "user" as const, content: message };
    this.messages.push(userMessage);
    await this.saveToSession(userMessage);

    // Calculate input tokens
    const inputTokens = this.tokenCounter.countMessageTokens(
      this.messages as any
    );
    yield {
      type: "token_count",
      tokenCount: inputTokens,
    };

    const maxToolRounds = 30; // Prevent infinite loops
    let toolRounds = 0;
    let totalOutputTokens = 0;

    try {
      // Agent loop - continue until no more tool calls or max rounds reached
      while (toolRounds < maxToolRounds) {
        // Check if operation was cancelled
        if (this.abortController?.signal.aborted) {
          yield {
            type: "content",
            content: "\n\n[Operation cancelled by user]",
          };
          yield { type: "done" };
          return;
        }

        // Stream response and accumulate
        const stream = this.groqClient.chatStream(this.messages, this.simpleMode ? undefined : GROQ_TOOLS);
        let accumulatedMessage: any = {};
        let accumulatedContent = "";
        let toolCallsYielded = false;

        for await (const chunk of stream) {
          // Check for cancellation in the streaming loop
          if (this.abortController?.signal.aborted) {
            yield {
              type: "content",
              content: "\n\n[Operation cancelled by user]",
            };
            yield { type: "done" };
            return;
          }

          if (!chunk.choices?.[0]) continue;

          // Accumulate the message using reducer
          accumulatedMessage = this.messageReducer(accumulatedMessage, chunk);

          // Check for tool calls - yield when we have complete tool calls with function names
          if (!toolCallsYielded && accumulatedMessage.tool_calls?.length > 0) {
            // Check if we have at least one complete tool call with a function name
            const hasCompleteTool = accumulatedMessage.tool_calls.some(
              (tc: any) => tc.function?.name
            );
            if (hasCompleteTool) {
              yield {
                type: "tool_calls",
                toolCalls: accumulatedMessage.tool_calls,
              };
              toolCallsYielded = true;
            }
          }

          // Stream content as it comes
          if (chunk.choices[0].delta?.content) {
            // Skip malformed function call content
            const content = chunk.choices[0].delta.content;
            if (!content.includes('<function') && !content.includes('</function>')) {
              accumulatedContent += content;
            }

            // Update token count in real-time
            const currentOutputTokens =
              this.tokenCounter.estimateStreamingTokens(accumulatedContent);
            totalOutputTokens = currentOutputTokens;

            // Only yield clean content
            if (!content.includes('<function') && !content.includes('</function>')) {
              yield {
                type: "content",
                content: content,
              };
            }

            // Emit token count update
            yield {
              type: "token_count",
              tokenCount: inputTokens + totalOutputTokens,
            };
          }
        }

        // Add assistant entry to history
        // Clean up any malformed function call syntax in content
        let cleanContent = accumulatedMessage.content || "";
        // Remove any XML-style function tags
        cleanContent = cleanContent.replace(/<function[^>]*>.*?<\/function>/gs, '');
        cleanContent = cleanContent.replace(/<function[^>]*>/g, '');
        cleanContent = cleanContent.trim();
        
        const assistantEntry: ChatEntry = {
          type: "assistant",
          content: cleanContent || (accumulatedMessage.tool_calls ? "Using tools to help you..." : ""),
          timestamp: new Date(),
          toolCalls: accumulatedMessage.tool_calls || undefined,
        };
        this.chatHistory.push(assistantEntry);

        // Add accumulated message to conversation
        const assistantMsg = {
          role: "assistant" as const,
          content: accumulatedMessage.content || "",
          tool_calls: accumulatedMessage.tool_calls?.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: tc.function
          })),
        } as any;
        this.messages.push(assistantMsg);
        await this.saveToSession(assistantMsg);

        // Handle tool calls if present
        if (accumulatedMessage.tool_calls?.length > 0) {
          toolRounds++;

          // Only yield tool_calls if we haven't already yielded them during streaming
          if (!toolCallsYielded) {
            yield {
              type: "tool_calls",
              toolCalls: accumulatedMessage.tool_calls,
            };
          }

          // Execute tools
          for (const toolCall of accumulatedMessage.tool_calls) {
            // Check for cancellation before executing each tool
            if (this.abortController?.signal.aborted) {
              yield {
                type: "content",
                content: "\n\n[Operation cancelled by user]",
              };
              yield { type: "done" };
              return;
            }

            const result = await this.executeTool(toolCall);

            const toolResultEntry: ChatEntry = {
              type: "tool_result",
              content: result.success
                ? result.output || "Success"
                : result.error || "Error occurred",
              timestamp: new Date(),
              toolCall: toolCall,
              toolResult: result,
            };
            this.chatHistory.push(toolResultEntry);

            yield {
              type: "tool_result",
              toolCall,
              toolResult: result,
            };

            // Add tool result with proper format (needed for AI context)
            const toolMsg = {
              role: "tool" as const,
              content: result.success
                ? result.output || "Success"
                : result.error || "Error",
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
            } as any;
            this.messages.push(toolMsg);
            await this.saveToSession(toolMsg);
          }

          // Continue the loop to get the next response (which might have more tool calls)
        } else {
          // No tool calls, we're done
          break;
        }
      }

      if (toolRounds >= maxToolRounds) {
        yield {
          type: "content",
          content:
            "\n\nMaximum tool execution rounds reached. Stopping to prevent infinite loops.",
        };
      }

      yield { type: "done" };
    } catch (error: any) {
      // Check if this was a cancellation
      if (this.abortController?.signal.aborted) {
        yield {
          type: "content",
          content: "\n\n[Operation cancelled by user]",
        };
        yield { type: "done" };
        return;
      }

      const errorEntry: ChatEntry = {
        type: "assistant",
        content: `Sorry, I encountered an error: ${error.message}`,
        timestamp: new Date(),
      };
      this.chatHistory.push(errorEntry);
      yield {
        type: "content",
        content: errorEntry.content,
      };
      yield { type: "done" };
    } finally {
      // Clean up abort controller
      this.abortController = null;
    }
  }

  private async executeTool(toolCall: GroqToolCall): Promise<ToolResult> {
    try {
      
      let args: any;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch (parseError: any) {
        
        // Try to clean up the arguments if they have extra content
        let cleanedArgs = toolCall.function.arguments;
        // Remove any trailing non-JSON content
        const lastBrace = cleanedArgs.lastIndexOf('}');
        if (lastBrace !== -1 && lastBrace < cleanedArgs.length - 1) {
          cleanedArgs = cleanedArgs.substring(0, lastBrace + 1);
          try {
            args = JSON.parse(cleanedArgs);
          } catch (secondError) {
            return {
              success: false,
              error: `Invalid JSON in tool arguments: ${parseError.message}`
            };
          }
        } else {
          return {
            success: false,
            error: `Invalid JSON in tool arguments: ${parseError.message}`
          };
        }
      }

      switch (toolCall.function.name) {
        case "view_file":
          const range: [number, number] | undefined =
            args.start_line && args.end_line
              ? [args.start_line, args.end_line]
              : undefined;
          return await this.textEditor.view(args.path, range);

        case "create_file":
          return await this.textEditor.create(args.path, args.content);

        case "str_replace_editor":
          return await this.textEditor.strReplace(
            args.path,
            args.old_str,
            args.new_str
          );

        case "bash":
          return await this.bash.execute(args.command);

        case "create_todo_list":
          return await this.todoTool.createTodoList(args.todos);

        case "update_todo_list":
          return await this.todoTool.updateTodoList(args.updates);

        case "web_fetch":
          return await this.webTool.fetch(args.url);

        case "web_search":
          // Ensure limit is a number (AI sometimes passes it as string)
          const searchLimit = args.limit ? Number(args.limit) : 5;
          return await this.webSearchTool.search(args.query, searchLimit);

        default:
          return {
            success: false,
            error: `Unknown tool: ${toolCall.function.name}`,
          };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Tool execution error: ${error.message}`,
      };
    }
  }

  getChatHistory(): ChatEntry[] {
    return [...this.chatHistory];
  }

  getCurrentDirectory(): string {
    return this.bash.getCurrentDirectory();
  }

  async executeBashCommand(command: string): Promise<ToolResult> {
    return await this.bash.execute(command);
  }

  getCurrentModel(): string {
    return this.groqClient.getCurrentModel();
  }

  setModel(model: string): void {
    this.groqClient.setModel(model);
    // Update token counter for new model
    this.tokenCounter.dispose();
    this.tokenCounter = createTokenCounter(model);
  }

  abortCurrentOperation(): void {
    // TODO: Implement abort operation
  }

  async fetchModels(): Promise<any[]> {
    const models = await this.groqClient.fetchModels();
    // Logic to set the default model to the latest or most capable
    if (models.length > 0) {
      // Simple heuristic: choose the model with the latest creation date or a known high-performance model
      const latestModel = models.reduce((prev, curr) => {
        return curr.created > prev.created ? curr : prev;
      }, models[0]);
      this.setModel(latestModel.id);
    }
    return models;
  }

  // Session management methods
  setSessionManager(sessionManager: SessionManager, session: Session): void {
    this.sessionManager = sessionManager;
    this.currentSession = session;
  }

  async loadSession(session: Session): Promise<void> {
    this.currentSession = session;
    
    // Save the current system message
    const systemMessage = this.messages.find(msg => msg.role === 'system');
    
    // Clear existing history and messages
    this.chatHistory = [];
    this.messages = [];
    
    // Restore system message first
    if (systemMessage) {
      this.messages.push(systemMessage);
    }
    
    // Restore messages from session
    for (const msg of session.messages) {
      this.messages.push(msg);
      
      // Rebuild chat history from messages
      if (msg.role === 'user') {
        this.chatHistory.push({
          type: 'user',
          content: msg.content as string,
          timestamp: new Date(),
        });
      } else if (msg.role === 'assistant') {
        this.chatHistory.push({
          type: 'assistant',
          content: msg.content as string,
          timestamp: new Date(),
          toolCalls: msg.tool_calls as any,
        });
      } else if (msg.role === 'tool') {
        this.chatHistory.push({
          type: 'tool_result',
          content: msg.content as string,
          timestamp: new Date(),
        });
      }
    }
  }

  private async saveToSession(message: GroqMessage): Promise<void> {
    if (this.sessionManager && this.currentSession) {
      await this.sessionManager.addMessageToCurrentSession(message);
    }
  }

  getSessionManager(): SessionManager | null {
    return this.sessionManager;
  }

  getCurrentSession(): Session | null {
    return this.currentSession;
  }
}
