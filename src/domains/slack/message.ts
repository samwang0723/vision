import { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import { SlackMessage, SlackMessageResponse } from './types';

type MessageArgs = SlackEventMiddlewareArgs<'message'> & AllMiddlewareArgs;

export const messageHandler = async ({
  message,
  say,
}: MessageArgs): Promise<void> => {
  const msg = message as SlackMessage;
  // logger.info('Received message:', msg);

  // Ignore messages from bots to prevent potential loops
  if (msg.text === undefined || msg.subtype) {
    return;
  }

  // Process the message here
  // You can add your custom logic to handle different types of messages
  const response: SlackMessageResponse = {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Received your message: "${msg.text}"\nPlease grant permission to access Confluence`,
        },
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Search Confluence',
          },
          action_id: 'confluence_search',
          value: msg.text,
        },
      },
    ],
    text: `Received your message: "${msg.text}"\nPlease grant permission to access Confluence`,
  };

  await say(response);
};
