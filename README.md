# Groq CLI

A conversational AI CLI tool powered by Groq with intelligent text editor capabilities and tool usage.

<img width="980" height="435" alt="Screenshot 2025-07-21 at 13 35 41" src="https://github.com/user-attachments/assets/192402e3-30a8-47df-9fc8-a084c5696e78" />

## Features

- **🤖 Conversational AI**: Natural language interface powered by Groq (Llama 3.3 70B)
- **📝 Smart File Operations**: AI automatically uses tools to view, create, and edit files
- **⚡ Bash Integration**: Execute shell commands through natural conversation
- **🔧 Automatic Tool Selection**: AI intelligently chooses the right tools for your requests
- **💬 Interactive UI**: Beautiful terminal interface built with Ink
- **🌍 Global Installation**: Install and use anywhere with `npm i -g groq-ai-cli`

## Installation

### Prerequisites
- Node.js 16+ 
- Groq API key from [Groq Console](https://console.groq.com/)

### Global Installation (Recommended)
```bash
npm install -g groq-ai-cli
```

### Local Development
```bash
git clone https://github.com/yukihamada/groq-cli
cd groq-cli
npm install
npm run build
npm link
```

## Setup

1. Get your Groq API key from [Groq Console](https://console.groq.com/keys)

2. Set up your API key (choose one method):

**Method 1: Environment Variable**
```bash
export GROQ_API_KEY=your_api_key_here
```

**Method 2: .env File**
```bash
cp .env.example .env
# Edit .env and add your API key
```

**Method 3: Command Line Flag**
```bash
groq --api-key your_api_key_here
```

## Usage

Start the conversational AI assistant:
```bash
groq
```

Or specify a working directory:
```bash
groq -d /path/to/project
```

### Custom Instructions

You can provide custom instructions to tailor Groq's behavior to your project by creating a `.groq/GROQ.md` file in your project directory:

```bash
mkdir .groq
```

Create `.groq/GROQ.md` with your custom instructions:
```markdown
# Custom Instructions for Groq CLI

Always use TypeScript for any new code files.
When creating React components, use functional components with hooks.
Prefer const assertions and explicit typing over inference where it improves clarity.
Always add JSDoc comments for public functions and interfaces.
Follow the existing code style and patterns in this project.
```

Groq will automatically load and follow these instructions when working in your project directory. The custom instructions are added to Groq's system prompt and take priority over default behavior.

## Example Conversations

Instead of typing commands, just tell Groq what you want to do:

```
💬 "Show me the contents of package.json"
💬 "Create a new file called hello.js with a simple console.log"
💬 "Find all TypeScript files in the src directory"
💬 "Replace 'oldFunction' with 'newFunction' in all JS files"
💬 "Run the tests and show me the results"
💬 "What's the current directory structure?"
```

## Development

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Build project
npm run build

# Run linter
npm run lint

# Type check
npm run typecheck
```

## Architecture

- **Agent**: Core command processing and execution logic
- **Tools**: Text editor and bash tool implementations
- **UI**: Ink-based terminal interface components
- **Types**: TypeScript definitions for the entire system

## License

MIT
