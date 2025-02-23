import { App, BlockButtonAction } from '@slack/bolt';
import config from '@config/index';
import logger from '@utils/logger';
import { analysisHandler } from '@/domains/slack/analysis';
import { actionHandler } from '@/domains/slack/action';
import { messageHandler } from '@/domains/slack/message';

// Initializes your app in socket mode with your app token and signing secret
const app = new App({
  token: config.slack.botToken,
  signingSecret: config.slack.signingSecret,
  socketMode: true,
  appToken: config.slack.appToken,
  logger: logger,
});

// The analysis command simply echoes on command
app.command('/analysis', analysisHandler);

// Listens to incoming messages that contain "hello"
app.message('hello', messageHandler);

// Handle button clicks
app.action<BlockButtonAction>('confluence_search', actionHandler);

(async (): Promise<void> => {
  try {
    // Start your app
    await app.start();
    logger.info('⚡️ Bolt app is running!');
  } catch (error) {
    logger.error('Failed to start app:', error);
    throw error;
  }
})();
