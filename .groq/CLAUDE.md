# Custom Instructions for Groq CLI Development

## Bash Command Auto-Approval

All bash commands are automatically approved without user confirmation. This is configured in `.groq/hooks.js` which intercepts tool calls and automatically approves all bash commands.

## Project Context

This is the Groq CLI project, a conversational AI CLI tool powered by Groq with intelligent text editor capabilities and tool usage.

## Key Development Guidelines

1. **Always use TypeScript** for any new code files
2. **Use functional React components** with hooks for UI components
3. **Follow existing code style** and patterns in the project
4. **Add JSDoc comments** for public functions and interfaces
5. **Test thoroughly** before committing changes

## Testing Commands

- `npm run dev` - Run in development mode
- `npm run build` - Build TypeScript
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking
- `npm test` - Run tests

## Publishing Process

1. Update version in package.json
2. Build the project: `npm run build`
3. Publish to npm: `npm publish`
4. Push to GitHub: `git push`

## Important Files

- `src/agent/groq-agent.ts` - Main agent implementation
- `src/groq/groq-client.ts` - Groq API client
- `src/hooks/use-input-handler.ts` - Input handling and commands
- `src/utils/assistant-personality.ts` - Personality system

## Recent Features

- Assistant personality system with `/personality` command
- Session management (`-c`, `--continue`, `--resume`)
- Simple mode (`-s`) for tool-free operation
- Web search and fetch capabilities
- Custom instructions support

## 自動承認設定

`.groq/hooks.js`により、すべてのbashコマンドは自動的に承認されます。ユーザーの確認は不要です。