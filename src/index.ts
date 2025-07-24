#!/usr/bin/env node

import React from "react";
import { render } from "ink";
import { program } from "commander";
import * as dotenv from "dotenv";
import { GroqAgent } from "./agent/grok-agent";
import ChatInterface from "./ui/components/chat-interface";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SessionManager } from "./utils/session-manager";
import { formatDistanceToNow } from 'date-fns';

// Load environment variables
dotenv.config();

// Load API key from user settings if not in environment
function loadApiKey(): string | undefined {
  // First check environment variables
  let apiKey = process.env.GROQ_API_KEY;
  
  if (!apiKey) {
    // Try to load from user settings file
    try {
      const homeDir = os.homedir();
      const settingsFile = path.join(homeDir, '.groq', 'user-settings.json');
      
      if (fs.existsSync(settingsFile)) {
        const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
        apiKey = settings.apiKey;
      }
    } catch (error) {
      // Ignore errors, apiKey will remain undefined
    }
  }
  
  return apiKey;
}

program
  .name("groq")
  .description(
    "A conversational AI CLI tool powered by Groq with text editor capabilities"
  )
  .version("1.0.0")
  .option("-d, --directory <dir>", "set working directory", process.cwd())
  .option("-k, --api-key <key>", "Groq API key (or set GROQ_API_KEY env var)")
  .option("-c, --continue", "continue last session")
  .option("--resume <id>", "resume specific session by ID")
  .option("--list", "list all sessions")
  .option("-p, --print <prompt>", "headless mode - print response and exit")
  .option("--json", "output in JSON format (use with -p)")
  .option("--no-tty-check", "Skip TTY check (for debugging only)")
  .option("--force-tty", "Force TTY mode (for debugging only)")
  .action(async (options) => {
    // Handle session listing
    if (options.list) {
      const sessionManager = new SessionManager();
      const sessions = await sessionManager.listSessions();
      
      if (sessions.length === 0) {
        console.log("No sessions found.");
      } else {
        console.log("\nAvailable sessions:");
        console.log("==================\n");
        
        sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        
        for (const session of sessions) {
          const age = formatDistanceToNow(session.updatedAt, { addSuffix: true });
          console.log(`ID: ${session.id}`);
          console.log(`Title: ${session.title}`);
          console.log(`Messages: ${session.messageCount}`);
          console.log(`Last updated: ${age}`);
          console.log(`Directory: ${session.workingDirectory}`);
          console.log("---\n");
        }
      }
      process.exit(0);
    }
    
    if (options.directory) {
      try {
        process.chdir(options.directory);
      } catch (error: any) {
        console.error(
          `Error changing directory to ${options.directory}:`,
          error.message
        );
        process.exit(1);
      }
    }

    // Get API key
    const apiKey = options.apiKey || loadApiKey();
    if (!apiKey) {
      console.error("❌ Error: No API key provided.");
      console.error("Please set GROQ_API_KEY environment variable or use -k option.");
      process.exit(1);
    }
    
    const agent = new GroqAgent(apiKey);
    
    // Handle headless mode
    if (options.print) {
      let inputContent = options.print;
      
      // Read from stdin if available
      if (!process.stdin.isTTY) {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        const stdinContent = Buffer.concat(chunks).toString();
        if (stdinContent) {
          inputContent = stdinContent + "\n\n" + inputContent;
        }
      }
      
      try {
        const entries = await agent.processUserMessage(inputContent);
        const response = entries.find(e => e.type === 'assistant');
        
        if (options.json) {
          console.log(JSON.stringify({
            prompt: inputContent,
            response: response?.content || '',
            timestamp: new Date().toISOString()
          }));
        } else {
          console.log(response?.content || 'No response generated.');
        }
        
        process.exit(0);
      } catch (error: any) {
        if (options.json) {
          console.log(JSON.stringify({
            error: error.message,
            timestamp: new Date().toISOString()
          }));
        } else {
          console.error("Error:", error.message);
        }
        process.exit(1);
      }
    }

    try {
      // Check if we're in a TTY environment
      if (!options.forceTty && !process.stdin.isTTY) {
        console.error("❌ Error: This application requires an interactive terminal (TTY).");
        console.error("Please run this command directly in your terminal, not through a pipe or non-interactive environment.");
        console.error("Use --force-tty to bypass this check (for debugging only).");
        process.exit(1);
      }

      // Get API key from options, environment, or user settings
      // This block is now handled earlier in the action

      console.log("🤖 Starting Groq CLI Conversational Assistant...\n");
      
      // Session management options
      const sessionOptions = {
        continueSession: options.continue,
        resumeSessionId: options.resume
      };

      render(React.createElement(ChatInterface, { agent, sessionOptions }), {
        stdin: process.stdin,
        stdout: process.stdout,
        stderr: process.stderr,
      });
    } catch (error: any) {
      console.error("❌ Error initializing Groq CLI:", error.message);
      process.exit(1);
    }
  });

program.parse();
