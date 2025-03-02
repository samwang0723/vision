import { App, BlockButtonAction } from '@slack/bolt';
import config from '@config/index';
import logger from '@utils/logger';
import { analysisHandler } from '@/domains/slack/analysis';
import { actionHandler } from '@/domains/slack/action';
import { messageHandler } from '@/domains/slack/message';
import { initSumologicTools } from './tools/sumologic/command';
import { initConfluenceTools } from './tools/atlassian/command';

// Initializes your app in socket mode with your app token and signing secret
export const app = new App({
  token: config.slack.botToken,
  signingSecret: config.slack.signingSecret,
  socketMode: true,
  appToken: config.slack.appToken,
  logger: logger,
});

// The analysis command simply echoes on command
app.command('/analysis', analysisHandler);

// Listens to incoming messages that contain "hello"
app.message(messageHandler);

// Handle button clicks
app.action<BlockButtonAction>(/.*/, actionHandler);

(async (): Promise<void> => {
  try {
    // Run initialization functions concurrently
    await Promise.all([initConfluenceTools(), initSumologicTools()]);

    // Start the Slack app after tools are initialized
    await app.start();
    logger.info('⚡️ Bolt app is running!');
  } catch (error) {
    logger.error('Failed to start app:', error);
    process.exit(1);
  }
})();
