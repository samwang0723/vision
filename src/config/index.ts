import dotenv from 'dotenv';

dotenv.config();

interface SlackConfig {
  signingSecret: string;
  botToken: string;
  appToken: string;
}

interface LoggingConfig {
  level: string;
}

interface Config {
  slack: SlackConfig;
  logging: LoggingConfig;
}

const config: Config = {
  slack: {
    signingSecret: process.env.SLACK_SIGNING_SECRET || '',
    botToken: process.env.SLACK_BOT_TOKEN || '',
    appToken: process.env.SLACK_APP_TOKEN || '',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

export default config; 