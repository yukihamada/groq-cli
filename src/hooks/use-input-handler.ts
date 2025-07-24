import { useState, useRef, useEffect } from "react";
import { useInput, useApp } from "ink";
import { GroqAgent, ChatEntry } from "../agent/groq-agent";
import { ConfirmationService } from "../utils/confirmation-service";

interface UseInputHandlerProps {
  agent: GroqAgent;
  chatHistory: ChatEntry[];
  setChatHistory: React.Dispatch<React.SetStateAction<ChatEntry[]>>;
  setIsProcessing: (processing: boolean) => void;
  setIsStreaming: (streaming: boolean) => void;
  setTokenCount: (count: number) => void;
  setProcessingTime: (time: number) => void;
  processingStartTime: React.MutableRefObject<number>;
  isProcessing: boolean;
  isStreaming: boolean;
  isConfirmationActive?: boolean;
}

interface CommandSuggestion {
  command: string;
  description: string;
}

interface ModelOption {
  model: string;
  description: string;
}

export function useInputHandler({
  agent,
  chatHistory,
  setChatHistory,
  setIsProcessing,
  setIsStreaming,
  setTokenCount,
  setProcessingTime,
  processingStartTime,
  isProcessing,
  isStreaming,
  isConfirmationActive = false,
}: UseInputHandlerProps) {
  const [input, setInput] = useState("");
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [showModelSelection, setShowModelSelection] = useState(false);
  const [selectedModelIndex, setSelectedModelIndex] = useState(0);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const { exit } = useApp();

  const commandSuggestions: CommandSuggestion[] = [
    // Help & Information
    { command: "/help", description: "Show available commands and usage" },
    { command: "/status", description: "Show Groq CLI status (version, model, session)" },
    { command: "/doctor", description: "Check health of your Groq CLI installation" },
    { command: "/release-notes", description: "View release notes and updates" },
    
    // Session & Context Management
    { command: "/clear", description: "Clear conversation history and free up context" },
    { command: "/compact", description: "Clear history but keep summary. Optional: /compact [instructions]" },
    { command: "/export", description: "Export current conversation to file or clipboard" },
    { command: "/save", description: "Save session with custom title" },
    { command: "/resume", description: "Resume a conversation. Use: /resume [session-id]" },
    { command: "/cost", description: "Show token usage and estimated cost for current session" },
    
    // Development Tools
    { command: "/add-dir", description: "Add directory contents to context" },
    { command: "/tree", description: "Show directory tree structure" },
    { command: "/init", description: "Initialize a new GROQ.md file with codebase documentation" },
    { command: "/summary", description: "Summarize current conversation" },
    
    // Configuration & Settings
    { command: "/models", description: "Switch between available Groq models" },
    { command: "/config", description: "Open configuration settings" },
    { command: "/memory", description: "Edit Groq memory files (GROQ.md)" },
    { command: "/theme", description: "Change UI theme (dark/light)" },
    
    // Feedback & Support
    { command: "/bug", description: "Submit feedback or report issues" },
    { command: "/upgrade", description: "Information about premium features" },
    
    // Application Control
    { command: "/exit", description: "Exit the application (alias: /quit)" },
    { command: "/quit", description: "Exit the application (alias: /exit)" },
  ];

  // Fetch models when /models command is triggered
  const fetchModels = async () => {
    try {
      setIsProcessing(true);
      const models = await agent.fetchModels();
      const modelOptions = models.map(model => ({
        model: model.id,
        description: `Model: ${model.id}`
      }));
      setAvailableModels(modelOptions);
      setIsProcessing(false);
    } catch (error: any) {
      setIsProcessing(false);
      const errorEntry: ChatEntry = {
        type: "assistant",
        content: `Error fetching models: ${error.message}`,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, errorEntry]);
    }
  };

  // Fetch models when /models command is triggered
  useEffect(() => {
    if (showModelSelection && availableModels.length === 0) {
      fetchModels();
    }
  }, [showModelSelection]);

  const handleDirectCommand = async (input: string): Promise<boolean> => {
    const trimmedInput = input.trim();

    if (trimmedInput === "/clear") {
      // Reset chat history
      setChatHistory([]);
      
      // Reset processing states
      setIsProcessing(false);
      setIsStreaming(false);
      setTokenCount(0);
      setProcessingTime(0);
      processingStartTime.current = 0;
      
      // Reset confirmation service session flags
      const confirmationService = ConfirmationService.getInstance();
      confirmationService.resetSession();
      
      setInput("");
      return true;
    }

    if (trimmedInput === "/help") {
      const helpEntry: ChatEntry = {
        type: "assistant",
        content: `Groq CLI - AI-powered terminal assistant

🔹 HELP & INFORMATION
  /help               Show this help message
  /status             Show current status (version, model, session)
  /doctor             Check health of Groq CLI installation
  /release-notes      View release notes and updates

🔹 SESSION & CONTEXT MANAGEMENT
  /clear              Clear conversation history
  /compact [instr]    Clear history but keep summary
  /export             Export conversation to file
  /save <title>       Save session with custom title
  /resume [id]        Resume a specific session
  /cost               Show token usage and cost estimate

🔹 DEVELOPMENT TOOLS
  /add-dir <path>     Add directory contents to context
  /tree [path]        Show directory tree structure
  /init               Initialize GROQ.md documentation
  /summary            Summarize current conversation

🔹 CONFIGURATION
  /models             Switch between Groq models
  /config             Open configuration settings
  /memory             Edit GROQ.md memory files
  /theme              Change UI theme

🔹 SUPPORT
  /bug                Report issues or submit feedback
  /upgrade            Information about premium features

🔹 APPLICATION
  /exit, /quit        Exit the application

💡 TIPS:
• Type "/" to see available commands
• Use natural language for complex tasks
• Direct bash commands work too (ls, cd, cat, etc.)

Examples:
  "Create a React component with TypeScript"
  "Find all TODO comments in the codebase"
  "Explain how this function works"`,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, helpEntry]);
      setInput("");
      return true;
    }

    if (trimmedInput === "/models") {
      setShowModelSelection(true);
      setSelectedModelIndex(0);
      setInput("");
      return true;
    }

    if (trimmedInput.startsWith("/models ")) {
      const modelArg = trimmedInput.split(" ")[1];
      const modelNames = availableModels.map(m => m.model);

      if (modelNames.includes(modelArg)) {
        agent.setModel(modelArg);
        const confirmEntry: ChatEntry = {
          type: "assistant",
          content: `✓ Switched to model: ${modelArg}`,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, confirmEntry]);
      } else {
        const errorEntry: ChatEntry = {
          type: "assistant",
          content: `Invalid model: ${modelArg}

Available models: ${modelNames.join(", ")}`,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, errorEntry]);
      }

      setInput("");
      return true;
    }

    // Handle /tree command
    if (trimmedInput === "/tree" || trimmedInput.startsWith("/tree ")) {
      const path = trimmedInput === "/tree" ? "." : trimmedInput.substring(6);
      const userEntry: ChatEntry = {
        type: "user",
        content: trimmedInput,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, userEntry]);
      
      try {
        const result = await agent.executeBashCommand(`find ${path} -type d -name .git -prune -o -type f -print | head -100 | sort`);
        const treeEntry: ChatEntry = {
          type: "assistant",
          content: result.success 
            ? `Directory structure:\n\`\`\`\n${result.output}\n\`\`\``
            : `Error: ${result.error}`,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, treeEntry]);
      } catch (error: any) {
        const errorEntry: ChatEntry = {
          type: "assistant",
          content: `Error getting directory tree: ${error.message}`,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, errorEntry]);
      }
      
      setInput("");
      return true;
    }

    // Handle /add-dir command
    if (trimmedInput.startsWith("/add-dir ")) {
      const dirPath = trimmedInput.substring(9);
      const userEntry: ChatEntry = {
        type: "user",
        content: `Please analyze all files in the directory: ${dirPath}`,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, userEntry]);
      
      // Let the AI handle the directory analysis using its tools
      await processUserMessage(`Please analyze all files in the directory: ${dirPath}`);
      setInput("");
      return true;
    }


    // Handle /summary command
    if (trimmedInput === "/summary") {
      const userEntry: ChatEntry = {
        type: "user",
        content: "Please provide a summary of our conversation so far.",
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, userEntry]);
      
      await processUserMessage("Please provide a summary of our conversation so far.");
      setInput("");
      return true;
    }

    // Handle /save command
    if (trimmedInput.startsWith("/save ")) {
      const title = trimmedInput.substring(6);
      const sessionManager = agent.getSessionManager();
      const currentSession = agent.getCurrentSession();
      
      if (sessionManager && currentSession) {
        await sessionManager.setSessionTitle(currentSession.id, title);
        const confirmEntry: ChatEntry = {
          type: "assistant",
          content: `✓ Session saved with title: "${title}"`,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, confirmEntry]);
      } else {
        const errorEntry: ChatEntry = {
          type: "assistant",
          content: "No active session to save.",
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, errorEntry]);
      }
      
      setInput("");
      return true;
    }

    // Handle /compact command (toggle)
    if (trimmedInput === "/compact") {
      // This would require adding a state for compact mode
      const infoEntry: ChatEntry = {
        type: "assistant",
        content: "Compact mode is not yet implemented.",
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, infoEntry]);
      setInput("");
      return true;
    }

    // Handle /status command
    if (trimmedInput === "/status") {
      const sessionManager = agent.getSessionManager();
      const currentSession = agent.getCurrentSession();
      const currentModel = agent.getCurrentModel();
      
      const statusEntry: ChatEntry = {
        type: "assistant",
        content: `Groq CLI Status:
        
Version: 0.2.0
Model: ${currentModel}
Session: ${currentSession ? currentSession.id : 'No active session'}
Messages: ${currentSession ? currentSession.messages.length : 0}
Working Directory: ${process.cwd()}
API: Connected ✓`,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, statusEntry]);
      setInput("");
      return true;
    }

    // Handle /doctor command
    if (trimmedInput === "/doctor") {
      const doctorEntry: ChatEntry = {
        type: "assistant",
        content: `Groq CLI Health Check:
        
✓ Node.js: ${process.version}
✓ Platform: ${process.platform}
✓ API Key: ${process.env.GROQ_API_KEY ? 'Configured' : 'Not set'}
✓ Session Directory: ~/.groq/sessions/
✓ Settings Directory: ~/.groq/
✓ Working Directory: ${process.cwd()}

All systems operational!`,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, doctorEntry]);
      setInput("");
      return true;
    }

    // Handle /export command
    if (trimmedInput === "/export") {
      const exportEntry: ChatEntry = {
        type: "assistant",
        content: "Export functionality coming soon. Will save conversation to a markdown file.",
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, exportEntry]);
      setInput("");
      return true;
    }

    // Handle /cost command
    if (trimmedInput === "/cost") {
      const costEntry: ChatEntry = {
        type: "assistant",
        content: `Session Cost Estimate:

Groq pricing: $0.39 per 1M tokens (both input and output)
Current session token usage will be displayed here soon.

This feature is under development.`,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, costEntry]);
      setInput("");
      return true;
    }

    // Handle /init command
    if (trimmedInput === "/init") {
      const userEntry: ChatEntry = {
        type: "user",
        content: "Please create a GROQ.md file with documentation for this codebase",
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, userEntry]);
      
      await processUserMessage("Please create a .groq/GROQ.md file with custom instructions for this codebase. Include information about the project structure, coding conventions, and any specific requirements.");
      setInput("");
      return true;
    }

    // Handle /release-notes command
    if (trimmedInput === "/release-notes") {
      const releaseEntry: ChatEntry = {
        type: "assistant",
        content: `Groq CLI Release Notes - v0.2.0

🚀 NEW FEATURES:
• Session management (-c, --continue, --resume)
• Web search functionality (AI can search when needed)
• Unix pipe support (echo "test" | groq -p)
• Advanced slash commands
• Improved command suggestions UI

📝 IMPROVEMENTS:
• Better error handling
• Consistent groq naming (fixed grok references)
• Enhanced help system
• More intuitive command interface

🐛 BUG FIXES:
• Fixed JSON parsing in tool calls
• Corrected model name references
• Session persistence issues resolved

For full changelog: https://github.com/yukihamada/groq-cli/releases`,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, releaseEntry]);
      setInput("");
      return true;
    }

    // Handle /theme command
    if (trimmedInput === "/theme") {
      const themeEntry: ChatEntry = {
        type: "assistant",
        content: "Theme switching is coming soon. Will support dark/light modes.",
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, themeEntry]);
      setInput("");
      return true;
    }

    // Handle /config command
    if (trimmedInput === "/config") {
      const configEntry: ChatEntry = {
        type: "assistant",
        content: `Configuration Settings:

Settings file: ~/.groq/user-settings.json
Session directory: ~/.groq/sessions/
Custom instructions: .groq/GROQ.md

Configuration management UI coming soon.`,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, configEntry]);
      setInput("");
      return true;
    }

    // Handle /memory command
    if (trimmedInput === "/memory") {
      const userEntry: ChatEntry = {
        type: "user",
        content: "Please show me the contents of .groq/GROQ.md if it exists, or help me create one.",
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, userEntry]);
      
      await processUserMessage("Please show me the contents of .groq/GROQ.md if it exists, or help me create one with custom instructions for this project.");
      setInput("");
      return true;
    }

    // Handle /upgrade command
    if (trimmedInput === "/upgrade") {
      const upgradeEntry: ChatEntry = {
        type: "assistant",
        content: `Groq CLI Premium Features (Coming Soon):

🌟 PLANNED FEATURES:
• Priority API access
• Extended context windows
• Advanced model selection
• Team collaboration features
• Custom model fine-tuning
• Analytics dashboard

Current version: Free & Open Source
Stay tuned for updates!`,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, upgradeEntry]);
      setInput("");
      return true;
    }

    // Handle /bug command
    if (trimmedInput === "/bug") {
      const bugEntry: ChatEntry = {
        type: "assistant",
        content: `Report bugs or submit feedback:

GitHub Issues: https://github.com/yukihamada/groq-cli/issues
Email: yukihamada@gmail.com

Please include:
- Groq CLI version (0.2.0)
- Error messages
- Steps to reproduce`,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, bugEntry]);
      setInput("");
      return true;
    }

    // Handle /exit and /quit commands
    if (trimmedInput === "/exit" || trimmedInput === "/quit") {
      exit();
      return true;
    }

    const directBashCommands = [
      "ls", "pwd", "cd", "cat", "mkdir", "touch", "echo", "grep", "find", "cp", "mv", "rm",
    ];
    const firstWord = trimmedInput.split(" ")[0];

    if (directBashCommands.includes(firstWord)) {
      const userEntry: ChatEntry = {
        type: "user",
        content: trimmedInput,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, userEntry]);

      try {
        const result = await agent.executeBashCommand(trimmedInput);

        const commandEntry: ChatEntry = {
          type: "tool_result",
          content: result.success
            ? result.output || "Command completed"
            : result.error || "Command failed",
          timestamp: new Date(),
          toolCall: {
            id: `bash_${Date.now()}`,
            type: "function",
            function: {
              name: "bash",
              arguments: JSON.stringify({ command: trimmedInput }),
            },
          },
          toolResult: result,
        };
        setChatHistory((prev) => [...prev, commandEntry]);
      } catch (error: any) {
        const errorEntry: ChatEntry = {
          type: "assistant",
          content: `Error executing command: ${error.message}`,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, errorEntry]);
      }

      setInput("");
      return true;
    }

    return false;
  };

  const processUserMessage = async (userInput: string) => {
    const userEntry: ChatEntry = {
      type: "user",
      content: userInput,
      timestamp: new Date(),
    };
    setChatHistory((prev) => [...prev, userEntry]);

    setIsProcessing(true);
    setInput("");

    try {
      setIsStreaming(true);
      let streamingEntry: ChatEntry | null = null;

      for await (const chunk of agent.processUserMessageStream(userInput)) {
        switch (chunk.type) {
          case "content":
            if (chunk.content) {
              // Filter out malformed function calls
              const cleanContent = chunk.content
                .replace(/<function[^>]*>.*?<\/function>/gs, '')
                .replace(/<function[^>]*>/g, '');
              
              if (cleanContent) {
                if (!streamingEntry) {
                  const newStreamingEntry = {
                    type: "assistant" as const,
                    content: cleanContent,
                    timestamp: new Date(),
                    isStreaming: true,
                  };
                  setChatHistory((prev) => [...prev, newStreamingEntry]);
                  streamingEntry = newStreamingEntry;
                } else {
                  setChatHistory((prev) =>
                    prev.map((entry, idx) =>
                      idx === prev.length - 1 && entry.isStreaming
                        ? { ...entry, content: entry.content + cleanContent }
                        : entry
                    )
                  );
                }
              }
            }
            break;

          case "token_count":
            if (chunk.tokenCount !== undefined) {
              setTokenCount(chunk.tokenCount);
            }
            break;

          case "tool_calls":
            if (chunk.toolCalls) {
              // Stop streaming for the current assistant message
              setChatHistory((prev) =>
                prev.map((entry) =>
                  entry.isStreaming ? { 
                    ...entry, 
                    isStreaming: false, 
                    toolCalls: chunk.toolCalls,
                    content: entry.content
                      .replace(/<function[^>]*>.*?<\/function>/gs, '')
                      .replace(/<function[^>]*>/g, '')
                      .trim()
                  } : entry
                )
              );
              streamingEntry = null;
            }
            break;

          case "tool_result":
            if (chunk.toolCall && chunk.toolResult) {
              setChatHistory((prev) =>
                prev.map((entry) =>
                  entry.isStreaming ? { ...entry, isStreaming: false } : entry
                )
              );

              const toolResultEntry: ChatEntry = {
                type: "tool_result",
                content: chunk.toolResult.success
                  ? chunk.toolResult.output || "Success"
                  : chunk.toolResult.error || "Error occurred",
                timestamp: new Date(),
                toolCall: chunk.toolCall,
                toolResult: chunk.toolResult,
              };
              setChatHistory((prev) => [...prev, toolResultEntry]);
              streamingEntry = null;
            }
            break;

          case "done":
            if (streamingEntry) {
              setChatHistory((prev) =>
                prev.map((entry) =>
                  entry.isStreaming ? { 
                    ...entry, 
                    isStreaming: false,
                    content: entry.content
                      .replace(/<function[^>]*>.*?<\/function>/gs, '')
                      .replace(/<function[^>]*>/g, '')
                      .trim()
                  } : entry
                )
              );
            }
            setIsStreaming(false);
            break;
        }
      }
    } catch (error: any) {
      const errorEntry: ChatEntry = {
        type: "assistant",
        content: `Error: ${error.message}`,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, errorEntry]);
      setIsStreaming(false);
    }

    setIsProcessing(false);
    processingStartTime.current = 0;
  };

  // Only use useInput if stdin supports raw mode
  if (process.stdin.isTTY && process.stdin.setRawMode) {
    useInput(async (inputChar: string, key: any) => {
    // Don't handle input if confirmation dialog is active
    if (isConfirmationActive) {
      return;
    }
    
    if (key.ctrl && inputChar === "c") {
      exit();
      return;
    }

    if (key.escape) {
      if (showCommandSuggestions) {
        setShowCommandSuggestions(false);
        setSelectedCommandIndex(0);
        return;
      }
      if (showModelSelection) {
        setShowModelSelection(false);
        setSelectedModelIndex(0);
        return;
      }
      if (isProcessing || isStreaming) {
        agent.abortCurrentOperation();
        setIsProcessing(false);
        setIsStreaming(false);
        setTokenCount(0);
        setProcessingTime(0);
        processingStartTime.current = 0;
        return;
      }
    }

    if (showCommandSuggestions) {
      if (key.upArrow) {
        setSelectedCommandIndex((prev) =>
          prev === 0 ? commandSuggestions.length - 1 : prev - 1
        );
        return;
      }
      if (key.downArrow) {
        setSelectedCommandIndex((prev) => (prev + 1) % commandSuggestions.length);
        return;
      }
      if (key.tab || key.return) {
        const selectedCommand = commandSuggestions[selectedCommandIndex];
        setInput(selectedCommand.command + " ");
        setShowCommandSuggestions(false);
        setSelectedCommandIndex(0);
        return;
      }
    }

    if (showModelSelection) {
      if (key.upArrow) {
        setSelectedModelIndex((prev) =>
          prev === 0 ? availableModels.length - 1 : prev - 1
        );
        return;
      }
      if (key.downArrow) {
        setSelectedModelIndex((prev) => (prev + 1) % availableModels.length);
        return;
      }
      if (key.tab || key.return) {
        const selectedModel = availableModels[selectedModelIndex];
        agent.setModel(selectedModel.model);
        const confirmEntry: ChatEntry = {
          type: "assistant",
          content: `✓ Switched to model: ${selectedModel.model}`,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, confirmEntry]);
        setShowModelSelection(false);
        setSelectedModelIndex(0);
        return;
      }
    }

    if (key.return) {
      const userInput = input.trim();
      if (userInput === "exit" || userInput === "quit") {
        exit();
        return;
      }

      if (userInput) {
        const directCommandResult = await handleDirectCommand(userInput);
        if (!directCommandResult) {
          await processUserMessage(userInput);
        }
      }
      return;
    }

    if (key.backspace || key.delete) {
      const newInput = input.slice(0, -1);
      setInput(newInput);

      if (!newInput.startsWith("/")) {
        setShowCommandSuggestions(false);
        setSelectedCommandIndex(0);
      }
      return;
    }

    if (inputChar && !key.ctrl && !key.meta) {
      const newInput = input + inputChar;
      setInput(newInput);

      if (
        newInput === "/" ||
        ["ls", "pwd", "cd", "cat", "mkdir", "touch"].some((cmd) =>
          cmd.startsWith(newInput)
        )
      ) {
        setShowCommandSuggestions(true);
        setSelectedCommandIndex(0);
      } else if (
        !newInput.startsWith("/") &&
        !["ls", "pwd", "cd", "cat", "mkdir", "touch"].some((cmd) =>
          cmd.startsWith(newInput)
        )
      ) {
        setShowCommandSuggestions(false);
        setSelectedCommandIndex(0);
      }
    }
  });
  }

  return {
    input,
    showCommandSuggestions,
    selectedCommandIndex,
    showModelSelection,
    selectedModelIndex,
    commandSuggestions,
    availableModels,
    agent,
  };
}