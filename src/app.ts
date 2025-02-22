import { App, SlackCommandMiddlewareArgs, BlockButtonAction } from '@slack/bolt';
import config from '@config/index';
import logger from '@utils/logger';
import { SlackMessage, SlackMessageResponse } from '@models/slack';

// Initializes your app in socket mode with your app token and signing secret
const app = new App({
  token: config.slack.botToken,
  signingSecret: config.slack.signingSecret,
  socketMode: true,
  appToken: config.slack.appToken,
  logger: logger,
});

// The analysis command simply echoes on command
app.command('/analysis', async ({ command, ack, respond }: SlackCommandMiddlewareArgs): Promise<void> => {
  // Acknowledge command request
  await ack();
  await respond(`${command.text}`);
});

// Listens to incoming messages that contain "hello"
app.message('hello', async ({ message, say }): Promise<void> => {
  const msg = message as SlackMessage;
  // say() sends a message to the channel where the event was triggered
  logger.info('Received message:', msg);

  const response: SlackMessageResponse = {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Hey there <@${msg.user}>!`,
        },
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Click Me',
          },
          action_id: 'button_click',
        },
      },
    ],
    text: `Hey there <@${msg.user}>!`,
  };

  await say(response);
});

app.action<BlockButtonAction>('button_click', async ({ body, ack, respond }): Promise<void> => {
  // Acknowledge the action
  await ack();
  await respond(`<@${body.user.id}> clicked the button`);
});

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