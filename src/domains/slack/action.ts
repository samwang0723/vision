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
      const response = await callClaude(
        `Please search on confluence under space=TMAB using cql for the following query: ${originalMessage}`
      ).then(processResponse);

      const textContent = response?.content
        .filter((content: any) => content.type === 'text')
        .map((content: any) => content.text)
        .join('\n');

      await respond({
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
