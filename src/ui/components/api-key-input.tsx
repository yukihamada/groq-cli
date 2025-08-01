import React, { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { GroqAgent } from "../../agent/groq-agent";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface ApiKeyInputProps {
  onApiKeySet: (agent: GroqAgent) => void;
  sessionOptions?: {
    continueSession?: boolean;
    resumeSessionId?: string;
  };
}

interface UserSettings {
  apiKey?: string;
}

export default function ApiKeyInput({ onApiKeySet }: ApiKeyInputProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { exit } = useApp();

  useInput((inputChar, key) => {
    if (isSubmitting) return;

    if (key.ctrl && inputChar === "c") {
      exit();
      return;
    }

    if (key.return) {
      handleSubmit();
      return;
    }


    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      setError("");
      return;
    }

    if (inputChar && !key.ctrl && !key.meta) {
      setInput((prev) => prev + inputChar);
      setError("");
    }
  });


  const handleSubmit = async () => {
    if (!input.trim()) {
      setError("API key cannot be empty");
      return;
    }

    setIsSubmitting(true);
    try {
      const apiKey = input.trim();
      const agent = new GroqAgent(apiKey);
      
      // Set environment variable for current process
      process.env.GROQ_API_KEY = apiKey;
      
      // Save to .groq/user-settings.json
      try {
        const homeDir = os.homedir();
        const groqDir = path.join(homeDir, '.groq');
        const settingsFile = path.join(groqDir, 'user-settings.json');
        
        // Create .groq directory if it doesn't exist
        if (!fs.existsSync(groqDir)) {
          fs.mkdirSync(groqDir, { mode: 0o700 });
        }
        
        // Load existing settings or create new
        let settings: UserSettings = {};
        if (fs.existsSync(settingsFile)) {
          try {
            settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
          } catch {
            settings = {};
          }
        }
        
        // Update API key
        settings.apiKey = apiKey;
        
        // Save settings
        fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), { mode: 0o600 });
        
        console.log(`\n✅ API key saved to ~/.groq/user-settings.json`);
      } catch (error) {
        console.log('\n⚠️ Could not save API key to settings file');
        console.log('API key set for current session only');
      }
      
      onApiKeySet(agent);
    } catch (error: any) {
      setError("Invalid API key format");
      setIsSubmitting(false);
    }
  };

  const displayText = input.length > 0 ? 
    (isSubmitting ? "*".repeat(input.length) : "*".repeat(input.length) + "█") : 
    (isSubmitting ? " " : "█");

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color="yellow">🔑 Groq API Key Required</Text>
      <Box marginBottom={1}>
        <Text color="gray">Please enter your Groq API key to continue:</Text>
      </Box>
      
      <Box borderStyle="round" borderColor="blue" paddingX={1} marginBottom={1}>
        <Text color="gray">❯ </Text>
        <Text>{displayText}</Text>
      </Box>

      {error ? (
        <Box marginBottom={1}>
          <Text color="red">❌ {error}</Text>
        </Box>
      ) : null}

      <Box flexDirection="column" marginTop={1}>
        <Text color="gray" dimColor>• Press Enter to submit</Text>
        <Text color="gray" dimColor>• Press Ctrl+C to exit</Text>
        <Text color="gray" dimColor>Note: API key will be saved to ~/.groq/user-settings.json</Text>
      </Box>

      {isSubmitting ? (
        <Box marginTop={1}>
          <Text color="yellow">🔄 Validating API key...</Text>
        </Box>
      ) : null}
    </Box>
  );
}