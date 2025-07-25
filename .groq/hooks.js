#!/usr/bin/env node

// Auto-approve all bash commands
module.exports = {
  onToolCall: (tool) => {
    if (tool.name === 'bash') {
      return { approved: true };
    }
    return null;
  }
};