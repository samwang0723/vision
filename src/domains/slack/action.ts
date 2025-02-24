/* eslint-disable @typescript-eslint/no-explicit-any */
import { SlackActionMiddlewareArgs, BlockButtonAction } from '@slack/bolt';
import logger from '@utils/logger';
import config from '@config/index';
import {
  mapToolsToAnthropic,
  callClaude,
  processResponse,
} from '@domains/anthropic/service';
import { handleMCPCommand } from '@domains/atlassian/command';
import { app } from '@/app';

export interface ConfluenceConfig {
  url: string;
  username: string;
  token: string;
}

export const actionHandler = async ({
  body,
  ack,
  respond,
}: SlackActionMiddlewareArgs<BlockButtonAction>): Promise<void> => {
  await ack();
  logger.info('Received action:', body);

  if (body.actions[0].action_id === 'confluence_search') {
    try {
      const originalMessage = body.actions[0].value;
      const primitives = await handleMCPCommand({
        url: config.confluence.baseUrl,
        username: config.confluence.apiUser,
        token: config.confluence.apiKey,
      });
      mapToolsToAnthropic(primitives);

      // Send initial response
      const initialResponse = await app.client.chat.postMessage({
        token: config.slack.botToken,
        channel: body.container.channel_id,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Searching Confluence...*',
            },
          },
        ],
        text: 'Searching Confluence...',
      });

      // Store the message timestamp for updates
      const messageTs = initialResponse.message?.ts;
      if (!messageTs) {
        throw new Error('Failed to get message timestamp');
      }

      let accumulatedText = '';
      let debounceSlackUpdateTime = performance.now();
      const UPDATE_INTERVAL = 800; // 0.8 seconds in milliseconds
      let updatePending = false;

      const updateSlackMessage = async () => {
        try {
          await app.client.chat.update({
            token: config.slack.botToken,
            channel: body.container.channel_id,
            ts: messageTs,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Search Results:*\n${accumulatedText}`,
                },
              },
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: `🔍 Search query: "${originalMessage}"`,
                  },
                ],
              },
            ],
            text: accumulatedText,
          });
          debounceSlackUpdateTime = performance.now();
          updatePending = false;
        } catch (updateError) {
          logger.error('Failed to update Slack message:', updateError);
          updatePending = false;
        }
      };

      const scheduleUpdate = () => {
        if (updatePending) {
          return;
        }

        const now = performance.now();
        const timeUntilNextUpdate = Math.max(
          0,
          UPDATE_INTERVAL - (now - debounceSlackUpdateTime)
        );

        if (timeUntilNextUpdate === 0) {
          updatePending = true;
          updateSlackMessage();
        } else {
          updatePending = true;
          setTimeout(() => {
            updateSlackMessage();
          }, timeUntilNextUpdate);
        }
      };

      const onStream = async (text: string) => {
        accumulatedText += text;
        scheduleUpdate();
      };

      const response = await callClaude(
        `Please search on confluence under space=TMAB using cql for the following query: ${originalMessage}`,
        onStream
      ).then(response => processResponse(response, onStream));

      // Ensure final state is shown
      const textContent = response?.content
        .filter((content: any) => content.type === 'text')
        .map((content: any) => content.text)
        .join('\n');

      await app.client.chat.update({
        token: config.slack.botToken,
        channel: body.container.channel_id,
        ts: messageTs,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Search Results:*\n${textContent || 'No results found'}`,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `🔍 Search query: "${originalMessage}"`,
              },
            ],
          },
        ],
        text: textContent || 'No response content available',
      });
    } catch (error: any) {
      logger.error('Failed to execute Confluence search:', error);
      await respond(
        `<@${body.user.id}> Failed to execute Confluence search: ${
          error?.message || 'Unknown error'
        }`
      );
    }
  }
};
