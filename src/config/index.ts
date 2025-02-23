import dotenv from 'dotenv';

dotenv.config();

interface SlackConfig {
  signingSecret: string;
  botToken: string;
  appToken: string;
}

interface ConfluenceConfig {
  apiKey: string;
  baseUrl: string;
  apiUser: string;
}

interface AnthropicConfig {
  apiKey: string;
}

interface LoggingConfig {
  level: string;
}

interface Config {
  slack: SlackConfig;
  confluence: ConfluenceConfig;
  anthropic: AnthropicConfig;
  logging: LoggingConfig;
}

const config: Config = {
  slack: {
    signingSecret: process.env.SLACK_SIGNING_SECRET || '',
    botToken: process.env.SLACK_BOT_TOKEN || '',
    appToken: process.env.SLACK_APP_TOKEN || '',
  },
  confluence: {
    apiKey: process.env.CONFLUENCE_API_KEY || '',
    baseUrl: process.env.CONFLUENCE_BASE_URL || '',
    apiUser: process.env.CONFLUENCE_API_USER || '',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

export default config;
