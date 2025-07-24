import React, { useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";
import { GroqAgent, ChatEntry } from "../../agent/groq-agent";
import { useInputHandler } from "../../hooks/use-input-handler";
import { LoadingSpinner } from "./loading-spinner";
import { CommandSuggestions } from "./command-suggestions";
import { ModelSelection } from "./model-selection";
import { ChatHistory } from "./chat-history";
import { ChatInput } from "./chat-input";
import ConfirmationDialog from "./confirmation-dialog";
import { ConfirmationService, ConfirmationOptions } from "../../utils/confirmation-service";
import ApiKeyInput from "./api-key-input";
import cfonts from "cfonts";
import { SessionManager } from "../../utils/session-manager";

interface ChatInterfaceProps {
  agent?: GroqAgent;
  sessionOptions?: {
    continueSession?: boolean;
    resumeSessionId?: string;
  };
}

// Main chat component that handles input when agent is available
function ChatInterfaceWithAgent({ agent, sessionOptions }: { agent: GroqAgent; sessionOptions?: { continueSession?: boolean; resumeSessionId?: string } }) {
  const [chatHistory, setChatHistory] = useState<ChatEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingTime, setProcessingTime] = useState(0);
  const [tokenCount, setTokenCount] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [confirmationOptions, setConfirmationOptions] = useState<ConfirmationOptions | null>(null);
  const scrollRef = useRef<any>();
  const processingStartTime = useRef<number>(0);
  const sessionManager = useRef<SessionManager>(new SessionManager());
  
  const confirmationService = ConfirmationService.getInstance();

  const {
    input,
    showCommandSuggestions,
    selectedCommandIndex,
    showModelSelection,
    selectedModelIndex,
    commandSuggestions,
    availableModels,
  } = useInputHandler({
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
    isConfirmationActive: !!confirmationOptions,
  });

  useEffect(() => {
    const initializeSession = async () => {
      console.clear();
      cfonts.say("GROQ", {
        font: "3d",
        align: "left",
        colors: ["magenta", "gray"],
        space: true,
        maxLength: "0",
        gradient: ["magenta", "cyan"],
        independentGradient: false,
        transitionGradient: true,
        env: "node",
      });

      console.log("Tips for getting started:");
      console.log("1. Ask questions, edit files, or run commands.");
      console.log("2. Be specific for the best results.");
      console.log(
        "3. Create .groq/GROQ.md files to customize your interactions with Groq."
      );
      console.log("4. /help for more information.");
      
      // Handle session loading
      if (sessionOptions?.continueSession) {
        const session = await sessionManager.current.getLastSession();
        if (session) {
          console.log(`\nContinuing session from ${session.updatedAt.toLocaleString()}`);
          agent.loadSession(session);
          setChatHistory(agent.getChatHistory());
        } else {
          console.log("\nNo previous session found. Starting new session.");
          const newSession = await sessionManager.current.createSession();
          agent.setSessionManager(sessionManager.current, newSession);
        }
      } else if (sessionOptions?.resumeSessionId) {
        const session = await sessionManager.current.loadSession(sessionOptions.resumeSessionId);
        if (session) {
          console.log(`\nResuming session: ${session.title || session.id}`);
          agent.loadSession(session);
          setChatHistory(agent.getChatHistory());
        } else {
          console.log(`\nSession not found: ${sessionOptions.resumeSessionId}. Starting new session.`);
          const newSession = await sessionManager.current.createSession();
          agent.setSessionManager(sessionManager.current, newSession);
        }
      } else {
        // Create new session
        const newSession = await sessionManager.current.createSession();
        agent.setSessionManager(sessionManager.current, newSession);
      }
      
      console.log("");
    };

    initializeSession();
  }, [agent, sessionOptions]);

  useEffect(() => {
    const handleConfirmationRequest = (options: ConfirmationOptions) => {
      setConfirmationOptions(options);
    };

    confirmationService.on('confirmation-requested', handleConfirmationRequest);

    return () => {
      confirmationService.off('confirmation-requested', handleConfirmationRequest);
    };
  }, [confirmationService]);

  useEffect(() => {
    if (!isProcessing && !isStreaming) {
      setProcessingTime(0);
      return;
    }

    if (processingStartTime.current === 0) {
      processingStartTime.current = Date.now();
    }

    const interval = setInterval(() => {
      setProcessingTime(
        Math.floor((Date.now() - processingStartTime.current) / 1000)
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [isProcessing, isStreaming]);

  const handleConfirmation = (dontAskAgain?: boolean) => {
    confirmationService.confirmOperation(true, dontAskAgain);
    setConfirmationOptions(null);
  };

  const handleRejection = (feedback?: string) => {
    confirmationService.rejectOperation(feedback);
    setConfirmationOptions(null);
    
    // Reset processing states when operation is cancelled
    setIsProcessing(false);
    setIsStreaming(false);
    setTokenCount(0);
    setProcessingTime(0);
    processingStartTime.current = 0;
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>
          Type your request in natural language. Type 'exit' or Ctrl+C to quit.
        </Text>
      </Box>

      <Box flexDirection="column" ref={scrollRef}>
        <ChatHistory entries={chatHistory} />
      </Box>

      {/* Show confirmation dialog if one is pending */}
      {confirmationOptions && (
        <ConfirmationDialog
          operation={confirmationOptions.operation}
          filename={confirmationOptions.filename}
          showVSCodeOpen={confirmationOptions.showVSCodeOpen}
          content={confirmationOptions.content}
          onConfirm={handleConfirmation}
          onReject={handleRejection}
        />
      )}


      {!confirmationOptions && (
        <>
          <LoadingSpinner
            isActive={isProcessing || isStreaming}
            processingTime={processingTime}
            tokenCount={tokenCount}
          />

          <ChatInput
            input={input}
            isProcessing={isProcessing}
            isStreaming={isStreaming}
          />

          <CommandSuggestions
            suggestions={commandSuggestions}
            input={input}
            selectedIndex={selectedCommandIndex}
            isVisible={showCommandSuggestions}
          />

          <ModelSelection
            models={availableModels}
            selectedIndex={selectedModelIndex}
            isVisible={showModelSelection}
            currentModel={agent.getCurrentModel()}
          />
        </>
      )}
    </Box>
  );
}

// Main component that handles API key input or chat interface
export default function ChatInterface({ agent, sessionOptions }: ChatInterfaceProps) {
  const [currentAgent, setCurrentAgent] = useState<GroqAgent | null>(agent || null);

  const handleApiKeySet = (newAgent: GroqAgent) => {
    setCurrentAgent(newAgent);
  };

  if (!currentAgent) {
    return <ApiKeyInput onApiKeySet={handleApiKeySet} sessionOptions={sessionOptions} />;
  }

  return <ChatInterfaceWithAgent agent={currentAgent} sessionOptions={sessionOptions} />;
}
