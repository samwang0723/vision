import { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import { SlackMessage, SlackMessageResponse } from './types';
import logger from '@utils/logger';

type MessageArgs = SlackEventMiddlewareArgs<'message'> & AllMiddlewareArgs;

export const messageHandler = async ({
  message,
  say,
}: MessageArgs): Promise<void> => {
  const msg = message as SlackMessage;
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
};
