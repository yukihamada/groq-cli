import { GroqClient, GroqMessage, GroqToolCall } from "../groq/groq-client";
import { GROQ_TOOLS } from "../groq/groq-tools";
import { TextEditorTool, BashTool, TodoTool, ConfirmationTool, WebTool, WebSearchTool } from "../tools";
import { ToolResult } from "../types";
import { EventEmitter } from "events";
import { createTokenCounter, TokenCounter } from "../utils/token-counter";
import { loadCustomInstructions } from "../utils/custom-instructions";
import { SessionManager, Session } from "../utils/session-manager";
import { AssistantPersonality, loadAssistantPersonality, generatePersonalityPrompt, DEFAULT_PERSONALITIES } from "../utils/assistant-personality";

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
  private personality: AssistantPersonality | null = null;

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

    // Load personality
    this.personality = loadAssistantPersonality();

    // Load custom instructions
    const customInstructions = loadCustomInstructions();
    const customInstructionsSection = customInstructions
      ? `\n\nCUSTOM INSTRUCTIONS:\n${customInstructions}\n\nThe above custom instructions should be followed alongside the standard instructions below.`
      : "";

    // Generate personality prompt
    const personalitySection = this.personality
      ? `\n\nPERSONALITY:\n${generatePersonalityPrompt(this.personality)}\n`
      : "";

    // Initialize with system message
    const systemContent = this.simpleMode 
      ? `You are Groq CLI, an AI assistant powered by Groq's fast inference.${personalitySection}${customInstructionsSection}

You are running in simple mode without access to tools. Focus on providing helpful, accurate responses based on your knowledge.

Current working directory: ${process.cwd()}`
      : `You are Groq CLI, an AI assistant that helps with file editing, coding tasks, and system operations.${personalitySection}${customInstructionsSection}

YOUR CORE PRINCIPLES:
1. THOROUGHNESS: Complete ALL aspects of every task. Never leave work half-done.
2. PERSISTENCE: Continue working until the entire request is fulfilled. Don't stop at the first success.
3. SYSTEMATIC: Use todo lists to track complex tasks and work through them methodically.
4. PROACTIVE: Anticipate what the user needs and complete the full solution.
5. RESILIENT: When you encounter errors, fix them and continue. Only stop if completely blocked.

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
You MUST use the TodoTool to manage and plan tasks. This helps you track progress, organize complex tasks, and demonstrate thoroughness to the user.

When to Use the TodoTool:
- Complex multi-step tasks (3 or more distinct steps)
- Non-trivial tasks requiring careful planning
- When users provide multiple tasks (numbered or comma-separated)
- After receiving new instructions - immediately capture requirements
- When you start working on a task - mark it as in_progress BEFORE beginning

When NOT to Use the TodoTool:
- Single, straightforward tasks
- Trivial tasks where tracking provides no benefit
- Tasks completable in less than 3 trivial steps
- Purely conversational or informational requests

TodoTool Usage Process:
1. IMMEDIATELY create a todo list when receiving a complex request
2. Break down the task into specific, actionable items
3. Set appropriate priorities: 'high' (🔴), 'medium' (🟡), 'low' (🟢)
4. Mark tasks as 'in_progress' BEFORE starting work (only ONE at a time)
5. Mark tasks as 'completed' IMMEDIATELY after finishing
6. Continue working through ALL tasks until the todo list is empty
7. Only stop when ALL tasks are marked as completed

CRITICAL PERSISTENCE RULES:
- NEVER stop working while there are pending todos
- ALWAYS check your todo list status before concluding
- If blocked on one task, create a new todo for the blocker and continue with other tasks
- Complete ALL tasks before reporting completion
- If errors occur, document them in new todos and continue working

Example Task Breakdown:
User: "Create a React component with tests and documentation"
Your todos:
1. [high] Create React component file with implementation
2. [high] Create unit test file with comprehensive tests
3. [medium] Add JSDoc documentation to component
4. [medium] Create usage documentation in README
5. [low] Run tests to ensure they pass

IMPORTANT: You MUST work through EVERY todo item. Do not stop after completing just one or two tasks. Continue until your todo list shows all items as completed

USER CONFIRMATION SYSTEM:
File operations (create_file, str_replace_editor) and bash commands will automatically request user confirmation before execution. The confirmation system will show users the actual content or command before they decide. Users can choose to approve individual operations or approve all operations of that type for the session.

If a user rejects an operation, the tool will return an error and you should not proceed with that specific operation.

Be helpful, direct, and efficient. Always explain what you're doing and show the results.

WORK PERSISTENCE AND THOROUGHNESS:
You are designed to be a persistent, thorough assistant that completes ALL aspects of a task:

1. NEVER stop working prematurely - continue until the entire request is fulfilled
2. When given a complex task, break it down and work through EVERY part systematically
3. If you encounter errors:
   - Try to fix them immediately
   - If you can't fix an error, document it and continue with other parts
   - Only stop if the error completely blocks all progress
4. Always verify your work:
   - Run tests if applicable
   - Check that files were created/modified correctly
   - Ensure the solution actually works
5. Common patterns that require persistence:
   - "Fix all errors" means fix EVERY error, not just the first one
   - "Update the project" means update ALL relevant files
   - "Create a feature" includes implementation, tests, and documentation
   - "Debug this" means find AND fix the issue, not just identify it

Remember: Users expect you to complete the ENTIRE task, not just start it. Work diligently through all requirements before considering the task complete.

IMPORTANT RESPONSE GUIDELINES:
- After using tools, do NOT respond with pleasantries like "Thanks for..." or "Great!"
- Only provide necessary explanations or next steps if relevant to the task
- Keep responses concise and focused on the actual work being done
- NEVER say "I've completed the task" or "All done" unless you have:
  1. Checked your todo list and ALL items are marked as completed
  2. Verified that all requested functionality is working
  3. Run any necessary tests or verification commands
- Continue working silently through tasks without premature conclusions
- If you encounter an error, fix it and continue - don't stop to report it unless it's blocking
- Always complete ALL aspects of a request before stopping

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
    
    const messageStr = String(message || '');
    const lowerMessage = messageStr.toLowerCase();
    return webSearchKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  async processUserMessage(message: string): Promise<ChatEntry[]> {
    // Ensure message is a string
    const messageStr = String(message || '');
    
    // Preprocess message for better tool usage with Japanese input
    let processedMessage = messageStr;
    
    // Common Japanese patterns that might cause issues
    if (messageStr.includes("何がある") || messageStr.includes("プロジェクト") || messageStr.includes("ファイル")) {
      // Add explicit instruction for listing files
      processedMessage = messageStr + "\n\nPlease use the bash tool with appropriate commands like 'ls' or 'find' to explore the directory structure.";
    }
    
    // Add user message to conversation
    const userEntry: ChatEntry = {
      type: "user",
      content: messageStr,
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
            console.log(`Successfully parsed malformed tool call`);
            assistantMessage.tool_calls = parsedCalls;
          } else if (assistantMessage.content.includes('<function') || assistantMessage.content.includes('function.')) {
            console.log(`Detected tool call pattern but failed to parse: ${assistantMessage.content.substring(0, 200)}`);
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
      /<function=([a-zA-Z_]\w*)\s*({[^}]+})/,                      // <function=tool_name {...}>
      /<function\(([a-zA-Z_]\w*)\s*({[^}]+})\)/,                   // <function(tool_name {...})
      /<function\\([a-zA-Z_]\w*)\s*({[^}]+})/,                     // <function\tool_name{...}
      /<function\s+([a-zA-Z_]\w*)\s*\[({[^}]+})\]/,                // <function tool_name [{...}]
      /^([a-zA-Z_]\w*)\(({[^}]+})\)/,                              // tool_name({...})
      /<function>([a-zA-Z_]\w*)\s*({[^}]+})<\/function>/,          // <function>tool_name {...}</function>
      /<([a-zA-Z_]\w*)>({[^}]+})<\/\1>/,                           // <tool_name>{...}</tool_name>
      /<function=([a-zA-Z_]\w*)\s*\[({[^}]+})\]/,                  // <function=tool_name [{...}]>
      /<function=([a-zA-Z_]\w*)\s*\(({[^}]+})\)/,                  // <function=tool_name ({...})>
      /function\.([a-zA-Z_]\w*)\(({[^}]+})\)/,                     // function.tool_name({...})
      /<function\s+([a-zA-Z_]\w*)\s*({[^}]+})>/,                   // <function tool_name {...}>
      /^<function=([a-zA-Z_]\w*)\s*({.*?})(?:command:)?>/m,        // <function=bash {"command": "ls"}command:>
    ];
    
    for (const pattern of patterns) {
      const match = pattern.exec(content);
      if (match) {
        let toolName = match[1];
        let args = match[2];
        
        // Fix common tool name mappings
        const toolNameMap: Record<string, string> = {
          'bash': 'bash',
          'search': 'web_search',
          'web_search': 'web_search',
          'view': 'view_file',
          'view_file': 'view_file',
          'create': 'create_file',
          'create_file': 'create_file',
          'edit': 'str_replace_editor',
          'str_replace_editor': 'str_replace_editor',
        };
        
        toolName = toolNameMap[toolName] || toolName;
        
        try {
          // Clean up args - sometimes they have extra quotes or spaces
          args = args.trim();
          if (args.startsWith('"') && args.endsWith('"')) {
            args = args.slice(1, -1);
          }
          
          // Remove trailing characters like ']' or ')' that might be part of the pattern
          args = args.replace(/[\]\)]+$/, '');
          
          // Attempt to fix incomplete JSON
          if (!args.endsWith('}')) {
            args += '}';
          }
          
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
          // Try to fix common JSON errors
          try {
            // Add quotes to unquoted keys
            let fixedArgs = args.replace(/([{,]\s*)([a-zA-Z_]\w*)(\s*:)/g, '$1"$2"$3');
            
            // Fix single quotes to double quotes
            fixedArgs = fixedArgs.replace(/'/g, '"');
            
            // Remove any trailing commas before closing braces
            fixedArgs = fixedArgs.replace(/,\s*}/g, '}');
            
            JSON.parse(fixedArgs);
            
            return [{
              id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'function',
              function: {
                name: toolName,
                arguments: fixedArgs
              }
            }];
          } catch (e2) {
            console.error(`Failed to parse tool arguments for ${toolName}: ${args}`);
          }
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
    // Ensure message is a string
    const messageStr = String(message || '');
    
    // Create new abort controller for this request
    this.abortController = new AbortController();
    
    // Add user message to conversation
    const userEntry: ChatEntry = {
      type: "user",
      content: messageStr,
      timestamp: new Date(),
    };
    this.chatHistory.push(userEntry);
    const userMessage = { role: "user" as const, content: messageStr };
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

        // Try to parse malformed tool calls if needed
        if (!accumulatedMessage.tool_calls && accumulatedMessage.content) {
          const parsedCalls = this.parseTextToolCalls(accumulatedMessage.content);
          if (parsedCalls) {
            console.log(`Successfully parsed malformed tool call in stream`);
            accumulatedMessage.tool_calls = parsedCalls;
          } else if (accumulatedMessage.content.includes('<function') || accumulatedMessage.content.includes('function.')) {
            console.log(`Detected tool call pattern in stream but failed to parse: ${accumulatedMessage.content.substring(0, 200)}`);
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

  switchPersonality(personalityKey: string | null): void {
    if (personalityKey === null) {
      this.personality = null;
    } else {
      const personality = DEFAULT_PERSONALITIES[personalityKey as keyof typeof DEFAULT_PERSONALITIES];
      if (!personality) {
        throw new Error(`Unknown personality: ${personalityKey}. Available: ${Object.keys(DEFAULT_PERSONALITIES).join(', ')}`);
      }
      this.personality = personality;
    }
    
    // Regenerate system prompt with new personality
    const customInstructions = loadCustomInstructions();
    const customInstructionsSection = customInstructions
      ? `\n\nCUSTOM INSTRUCTIONS:\n${customInstructions}\n\nThe above custom instructions should be followed alongside the standard instructions below.`
      : "";

    const personalitySection = this.personality
      ? `\n\nPERSONALITY:\n${generatePersonalityPrompt(this.personality)}\n`
      : "";

    const systemContent = this.simpleMode 
      ? `You are Groq CLI, an AI assistant powered by Groq's fast inference.${personalitySection}${customInstructionsSection}

You are running in simple mode without access to tools. Focus on providing helpful, accurate responses based on your knowledge.

Current working directory: ${process.cwd()}`
      : `You are Groq CLI, an AI assistant that helps with file editing, coding tasks, and system operations.${personalitySection}${customInstructionsSection}

YOUR CORE PRINCIPLES:
1. THOROUGHNESS: Complete ALL aspects of every task. Never leave work half-done.
2. PERSISTENCE: Continue working until the entire request is fulfilled. Don't stop at the first success.
3. SYSTEMATIC: Use todo lists to track complex tasks and work through them methodically.
4. PROACTIVE: Anticipate what the user needs and complete the full solution.
5. RESILIENT: When you encounter errors, fix them and continue. Only stop if completely blocked.

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
You MUST use the TodoTool to manage and plan tasks. This helps you track progress, organize complex tasks, and demonstrate thoroughness to the user.

When to Use the TodoTool:
- Complex multi-step tasks (3 or more distinct steps)
- Non-trivial tasks requiring careful planning
- When users provide multiple tasks (numbered or comma-separated)
- After receiving new instructions - immediately capture requirements
- When you start working on a task - mark it as in_progress BEFORE beginning

When NOT to Use the TodoTool:
- Single, straightforward tasks
- Trivial tasks where tracking provides no benefit
- Tasks completable in less than 3 trivial steps
- Purely conversational or informational requests

TodoTool Usage Process:
1. IMMEDIATELY create a todo list when receiving a complex request
2. Break down the task into specific, actionable items
3. Set appropriate priorities: 'high' (🔴), 'medium' (🟡), 'low' (🟢)
4. Mark tasks as 'in_progress' BEFORE starting work (only ONE at a time)
5. Mark tasks as 'completed' IMMEDIATELY after finishing
6. Continue working through ALL tasks until the todo list is empty
7. Only stop when ALL tasks are marked as completed

CRITICAL PERSISTENCE RULES:
- NEVER stop working while there are pending todos
- ALWAYS check your todo list status before concluding
- If blocked on one task, create a new todo for the blocker and continue with other tasks
- Complete ALL tasks before reporting completion
- If errors occur, document them in new todos and continue working

Example Task Breakdown:
User: "Create a React component with tests and documentation"
Your todos:
1. [high] Create React component file with implementation
2. [high] Create unit test file with comprehensive tests
3. [medium] Add JSDoc documentation to component
4. [medium] Create usage documentation in README
5. [low] Run tests to ensure they pass

IMPORTANT: You MUST work through EVERY todo item. Do not stop after completing just one or two tasks. Continue until your todo list shows all items as completed

USER CONFIRMATION SYSTEM:
File operations (create_file, str_replace_editor) and bash commands will automatically request user confirmation before execution. The confirmation system will show users the actual content or command before they decide. Users can choose to approve individual operations or approve all operations of that type for the session.

If a user rejects an operation, the tool will return an error and you should not proceed with that specific operation.

Be helpful, direct, and efficient. Always explain what you're doing and show the results.

WORK PERSISTENCE AND THOROUGHNESS:
You are designed to be a persistent, thorough assistant that completes ALL aspects of a task:

1. NEVER stop working prematurely - continue until the entire request is fulfilled
2. When given a complex task, break it down and work through EVERY part systematically
3. If you encounter errors:
   - Try to fix them immediately
   - If you can't fix an error, document it and continue with other parts
   - Only stop if the error completely blocks all progress
4. Always verify your work:
   - Run tests if applicable
   - Check that files were created/modified correctly
   - Ensure the solution actually works
5. Common patterns that require persistence:
   - "Fix all errors" means fix EVERY error, not just the first one
   - "Update the project" means update ALL relevant files
   - "Create a feature" includes implementation, tests, and documentation
   - "Debug this" means find AND fix the issue, not just identify it

Remember: Users expect you to complete the ENTIRE task, not just start it. Work diligently through all requirements before considering the task complete.

IMPORTANT RESPONSE GUIDELINES:
- After using tools, do NOT respond with pleasantries like "Thanks for..." or "Great!"
- Only provide necessary explanations or next steps if relevant to the task
- Keep responses concise and focused on the actual work being done
- NEVER say "I've completed the task" or "All done" unless you have:
  1. Checked your todo list and ALL items are marked as completed
  2. Verified that all requested functionality is working
  3. Run any necessary tests or verification commands
- Continue working silently through tasks without premature conclusions
- If you encounter an error, fix it and continue - don't stop to report it unless it's blocking
- Always complete ALL aspects of a request before stopping

Current working directory: ${process.cwd()}`;

    // Update the system message
    if (this.messages.length > 0 && this.messages[0].role === 'system') {
      this.messages[0].content = systemContent;
    }
  }

  getCurrentPersonality(): AssistantPersonality | null {
    return this.personality;
  }
}
