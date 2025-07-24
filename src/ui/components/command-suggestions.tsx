import React from "react";
import { Box, Text } from "ink";

interface CommandSuggestion {
  command: string;
  description: string;
}

interface CommandSuggestionsProps {
  suggestions: CommandSuggestion[];
  input: string;
  selectedIndex: number;
  isVisible: boolean;
}

export function CommandSuggestions({
  suggestions,
  input,
  selectedIndex,
  isVisible,
}: CommandSuggestionsProps) {
  if (!isVisible) return null;

  const filteredSuggestions = suggestions
    .filter((suggestion) => {
      const searchTerm = input.toLowerCase();
      return suggestion.command.toLowerCase().includes(searchTerm) ||
             suggestion.description.toLowerCase().includes(searchTerm);
    })
    .slice(0, 10); // Show more suggestions

  // Group suggestions by category (based on comments in the array)
  const categories = {
    "Help & Information": ["help", "status", "doctor", "release-notes"],
    "Session & Context": ["clear", "compact", "export", "save", "resume", "cost"],
    "Development Tools": ["add-dir", "tree", "init", "summary", "search"],
    "Configuration": ["models", "config", "memory", "theme"],
    "Support": ["bug", "upgrade"],
    "Application": ["exit", "quit"]
  };

  // Find the max command length for padding
  const maxCmdLength = Math.max(...filteredSuggestions.map(s => s.command.length));

  return (
    <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="yellow">Available Commands</Text>
      </Box>
      
      {filteredSuggestions.map((suggestion, index) => (
        <Box key={index} paddingLeft={1}>
          <Box width={maxCmdLength + 4}>
            <Text
              bold={index === selectedIndex}
              color={index === selectedIndex ? "cyan" : "green"}
              backgroundColor={index === selectedIndex ? "gray" : undefined}
            >
              {suggestion.command.padEnd(maxCmdLength + 2)}
            </Text>
          </Box>
          <Text color={index === selectedIndex ? "white" : "gray"}>
            {suggestion.description}
          </Text>
        </Box>
      ))}
      
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray" dimColor>
          ↑↓ navigate • Enter/Tab select • Esc cancel
        </Text>
      </Box>
    </Box>
  );
}