# Vision Project

A Node.js-based Slack bot powered by Anthropic's Claude AI, featuring Confluence integration and intelligent conversation management.

## Features

- 🤖 AI-powered Slack bot using Claude 3.5 Sonnet
- 💬 Per-user conversation history management
- 🔍 Confluence search integration
- 🔄 Real-time message streaming and updates
- 🛠️ Tool-based command execution system
- 📝 TypeScript for type safety

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Slack Workspace and App credentials
- Anthropic API key
- Confluence credentials (optional)

## Installation

1. Clone the repository:

```bash
git clone https://github.com/samwang0723/vision.git
cd vision
```

2. Install dependencies:

```bash
make install
# or manually: npm install
```

3. Set up environment variables:

```bash
cp .env.example .env
# Edit .env with your configuration
```

## Development

Start the development server:

```bash
make dev
# or manually: npm run dev
```

## Available Scripts

- `make install` - Install project dependencies
- `make dev` - Start development server
- `make build` - Build for production
- `make lint` - Run ESLint
- `make lint-fix` - Fix ESLint issues
- `make test` - Run tests
- `make clean` - Clean build artifacts

## Environment Variables

The following environment variables are required:

```env
# Slack Configuration
SLACK_SIGNING_SECRET=your_slack_signing_secret
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token

# Anthropic Configuration
ANTHROPIC_API_KEY=your-anthropic-api-key

# Confluence Configuration (Optional)
CONFLUENCE_API_KEY=your-confluence-api-key
CONFLUENCE_BASE_URL=your-confluence-base-url
CONFLUENCE_API_USER=your-confluence-username

# Logging Configuration
LOG_LEVEL=debug  # Options: error, warn, info, debug
```

## Project Structure

```text
vision/
├── src/                    # Source code
│   ├── app.ts             # Application entry point
│   ├── config/            # Configuration files
│   ├── domains/           # Domain-specific modules
│   │   ├── anthropic/     # Claude AI integration
│   │   ├── atlassian/    # Confluence integration
│   │   ├── mcp/          # Model Context Protocol
│   │   └── slack/        # Slack bot functionality
│   ├── lib/              # Shared libraries
│   └── utils/            # Utility functions
├── tests/                # Test files
├── .env.example         # Example environment variables
├── .eslintrc.js        # ESLint configuration
├── .gitignore          # Git ignore rules
├── Makefile            # Build automation
├── package.json        # Project metadata and dependencies
└── README.md           # Project documentation
```

## Architecture

The project follows a domain-driven design approach with the following key components:

- **Slack Integration**: Handles Slack events, messages, and interactive components
- **Claude AI**: Manages conversations with Anthropic's Claude AI model
- **Message Queue Manager**: Maintains separate conversation histories for each user
- **Confluence Integration**: Provides search capabilities within Confluence spaces
- **Tool System**: Extensible command execution framework

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
