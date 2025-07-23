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
      const settingsFile = path.join(homeDir, '.grok', 'user-settings.json');
      
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
  .name("grok")
  .description(
    "A conversational AI CLI tool powered by Groq-3 with text editor capabilities"
  )
  .version("1.0.0")
  .option("-d, --directory <dir>", "set working directory", process.cwd())
  .option("-k, --api-key <key>", "Groq API key (or set GROK_API_KEY env var)")
  .option("--no-tty-check", "Skip TTY check (for debugging only)")
  .option("--force-tty", "Force TTY mode (for debugging only)")
  .action((options) => {
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

    try {
      // Check if we're in a TTY environment
      if (!options.forceTty && !process.stdin.isTTY) {
        console.error("❌ Error: This application requires an interactive terminal (TTY).");
        console.error("Please run this command directly in your terminal, not through a pipe or non-interactive environment.");
        console.error("Use --force-tty to bypass this check (for debugging only).");
        process.exit(1);
      }

      // Get API key from options, environment, or user settings
      const apiKey = options.apiKey || loadApiKey();
      const agent = apiKey ? new GroqAgent(apiKey) : undefined;

      console.log("🤖 Starting Groq CLI Conversational Assistant...\n");

      render(React.createElement(ChatInterface, { agent }), {
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
