# Groq CLI: A conversational AI CLI tool

A conversational AI CLI tool powered by Groq with intelligent text editor capabilities and tool usage.

[![npm version](https://img.shields.io/npm/v/groq-ai-cli.svg)](https://www.npmjs.com/package/groq-ai-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<img width="980" height="435" alt="Screenshot 2025-07-21 at 13 35 41" src="https://github.com/user-attachments/assets/192402e3-30a8-47df-9fc8-a084c5696e78" />

## ✨ Why Groq CLI?

- **⚡ Blazing Fast**: 500+ tokens/second processing speed
- **💰 Cost Effective**: 95x cheaper than GPT-4, 75x cheaper than Claude
- **🚀 Real-time Streaming**: Instant responses with no lag
- **🛠️ Full-featured**: File operations, bash commands, todo management
- **🎨 Beautiful UI**: Interactive terminal interface with syntax highlighting

## Features

- **🤖 Conversational AI**: Natural language interface powered by Groq (Llama 3.3 70B)
- **📝 Smart File Operations**: AI automatically uses tools to view, create, and edit files
- **⚡ Bash Integration**: Execute shell commands through natural conversation
- **🔧 Automatic Tool Selection**: AI intelligently chooses the right tools for your requests
- **💬 Interactive UI**: Beautiful terminal interface built with Ink
- **🌍 Global Installation**: Install and use anywhere with `npm i -g groq-ai-cli`
- **💾 Session Management**: Continue previous conversations with `-c` or `--resume`
- **🔗 Unix Pipe Support**: Use with pipes for headless operation

## Installation

### Prerequisites
- Node.js 16+ 
- Groq API key from [Groq Console](https://console.groq.com/keys)

### Install from npm
```bash
npm install -g groq-ai-cli
```

### Quick Start
```bash
# Set your API key
export GROQ_API_KEY=your_api_key_here

# Start Groq CLI
groq
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

### 1. Get Your API Key
Sign up at [Groq Console](https://console.groq.com/) and create an API key from the [keys page](https://console.groq.com/keys).

### 2. Configure API Key

**Option 1: Environment Variable (Recommended)**
```bash
export GROQ_API_KEY=your_api_key_here

# Add to your shell profile for persistence
echo 'export GROQ_API_KEY=your_api_key_here' >> ~/.bashrc
```

**Option 2: .env File**
```bash
# Create .env in your project directory
echo "GROQ_API_KEY=your_api_key_here" > .env
```

**Option 3: Command Line Flag**
```bash
groq --api-key your_api_key_here
```

## Usage

### Basic Usage
```bash
# Start in current directory
groq

# Start in specific directory
groq -d /path/to/project
```

### Session Management
```bash
# Continue last session
groq -c

# List all sessions
groq --list

# Resume specific session
groq --resume <session-id>
```

### Unix Pipe Support
```bash
# Pipe input and get response
echo "What is the capital of France?" | groq -p

# Process file contents
cat myfile.txt | groq -p "Summarize this file"

# JSON output
echo "Explain quantum computing" | groq -p --json
```

### Built-in Commands
- `/help` - Show available commands
- `/clear` - Clear chat history
- `/models` - Switch between Groq models
- `/search <query>` - Search the web for information
- `/tree` - Show directory structure
- `/add-dir <path>` - Add directory contents to context
- `/summary` - Summarize current conversation
- `/save <title>` - Save session with custom title
- `/exit` - Exit the application

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
💬 "Create a new React component called Header"
💬 "Find all TypeScript files in the src directory"
💬 "Fix the ESLint errors in this file"
💬 "Run npm test and show me the results"
💬 "Create a todo list for implementing user authentication"
```

### Advanced Examples
```
💬 "Analyze this codebase and suggest improvements"
💬 "Help me debug why my API calls are failing"
💬 "Convert this JavaScript file to TypeScript"
💬 "Write unit tests for the utils folder"
💬 "Fetch the latest documentation from https://docs.groq.com"
```

## Features Comparison with Claude CLI

### What Groq CLI now has:
- ✅ Session management (`-c`, `--continue`, `--resume`)
- ✅ Unix pipe support (`echo "test" | groq -p`)
- ✅ Web fetch capabilities (`web_fetch` tool)
- ✅ Web search functionality (`web_search` tool, `/search` command)
- ✅ Advanced slash commands (`/tree`, `/add-dir`, `/summary`)
- ✅ Custom instructions (`.groq/GROQ.md`)
- ✅ File operations and bash commands
- ✅ Todo list management
- ✅ Model switching
- ✅ JSON output mode

### Performance Advantages

#### Speed (tokens/sec)
| Model | Speed | Notes |
|-------|-------|-------|
| Groq (Llama 3.3 70B) | 500+ | Fastest available |
| GPT-4 | 20 | 25x slower |
| Claude 3.5 | 40 | 12.5x slower |

#### Cost (per 1M tokens)
| Model | Input | Output |
|-------|-------|--------|
| Groq | $0.39 | $0.39 |
| GPT-4 | $30 | $60 |
| Claude 3.5 | $3 | $15 |

## Development

### Local Development Setup
```bash
# Clone the repository
git clone https://github.com/yukihamada/groq-cli
cd groq-cli

# Install dependencies
npm install

# Development mode
npm run dev

# Build project
npm run build

# Run tests
npm test

# Run linter
npm run lint

# Type check
npm run typecheck
```

## Architecture

- **Agent**: Core command processing and execution logic
- **Tools**: Text editor, bash, todo, and confirmation tool implementations
- **UI**: React-based terminal interface using Ink
- **Groq Integration**: OpenAI-compatible client for Groq API
- **Types**: TypeScript definitions for the entire system

## Performance & Cost

| Metric | Groq CLI | GPT-4 CLI | Claude CLI |
|--------|----------|-----------|------------|
| Speed | 500+ tokens/sec | 30 tokens/sec | 50 tokens/sec |
| Cost (per 1M tokens) | $0.59-0.79 | $30-60 | $15-75 |
| Latency | <100ms | 500-1000ms | 300-800ms |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Links

- [NPM Package](https://www.npmjs.com/package/groq-ai-cli)
- [GitHub Repository](https://github.com/yukihamada/groq-cli)
- [Groq Console](https://console.groq.com/)
- [Report Issues](https://github.com/yukihamada/groq-cli/issues)

## License

MIT © [Yuki Hamada](https://github.com/yukihamada)
