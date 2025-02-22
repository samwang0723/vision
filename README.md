# Vision Project

A Node.js application for Slack bot integration.

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Slack Workspace and App credentials

## Installation

1. Clone the repository:

```bash
git clone https://github.com/samwang0723/vision.git
cd vision
```

1. Install dependencies:

```bash
make install
# or manually: npm install
```

1. Set up environment variables:

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

# Logging Configuration
LOG_LEVEL=debug  # Options: error, warn, info, debug
```

## Project Structure

```text
vision/
├── src/              # Source code
│   ├── config/       # Configuration files
│   ├── controllers/  # Request handlers
│   ├── models/       # Data models
│   ├── routes/       # API routes
│   └── utils/        # Utility functions
├── tests/            # Test files
├── .env.example      # Example environment variables
├── .eslintrc.js     # ESLint configuration
├── .gitignore       # Git ignore rules
├── Makefile         # Build automation
├── package.json     # Project metadata and dependencies
└── README.md        # Project documentation
```

## Contributing

1. Fork the repository

1. Create your feature branch (`git checkout -b feature/amazing-feature`)

1. Commit your changes (`git commit -m 'Add some amazing feature'`)

1. Push to the branch (`git push origin feature/amazing-feature`)

1. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
