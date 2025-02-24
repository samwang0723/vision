/* eslint-disable @typescript-eslint/no-explicit-any */
import { SlackActionMiddlewareArgs, BlockButtonAction } from '@slack/bolt';
import logger from '@utils/logger';
import config from '@config/index';
import { callClaude, processResponse } from '@domains/anthropic/service';
import { app } from '@/app';
import { createSearchMessageBlocks } from './utils';
import { MessageUpdater } from './MessageUpdater';

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
  if (body.actions[0].action_id === 'confluence_search') {
    try {
      const query = body.actions[0].value;
      if (!query) {
        throw new Error('Search query is required');
      }

      // Send initial message
      const initialResponse = await app.client.chat.postMessage({
        token: config.slack.botToken,
        channel: body.container.channel_id,
        ...createSearchMessageBlocks({ text: '', query, isSearching: true }),
      });

      if (!initialResponse.message?.ts) {
        throw new Error('Failed to get message timestamp');
      }

      // Initialize message updater
      const messageUpdater = new MessageUpdater(
        app,
        body.container.channel_id,
        initialResponse.message.ts,
        config.slack.botToken,
        query
      );

      // Process search
      const response = await callClaude(
        `Please search on confluence under space=TMAB using cql for the following query: ${query}`,
        body.user.id,
        text => messageUpdater.update(text)
      ).then(response =>
        processResponse(response, body.user.id, text =>
          messageUpdater.update(text)
        )
      );

      // Show final results
      const textContent = response?.content
        .filter((content: any) => content.type === 'text')
        .map((content: any) => content.text)
        .join('\n');

      await app.client.chat.update({
        token: config.slack.botToken,
        channel: body.container.channel_id,
        ts: initialResponse.message.ts,
        ...createSearchMessageBlocks({
          text: textContent || 'No results found',
          query,
        }),
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
