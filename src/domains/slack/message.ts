import { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import { SlackMessage, SlackMessageResponse } from './types';
import { callClaude, processResponse } from '@domains/anthropic/service';
import { createSearchMessageBlocks } from './utils';
import { MessageUpdater } from './MessageUpdater';
import config from '@/config';
import logger from '@utils/logger';
import { app } from '@/app';
import { ToolUseBlock } from '@anthropic-ai/sdk/resources/messages';

type MessageArgs = SlackEventMiddlewareArgs<'message'> & AllMiddlewareArgs;

export const messageHandler = async ({
  message,
  say,
}: MessageArgs): Promise<void> => {
  try {
    const msg = message as SlackMessage;
    // Ignore messages from bots to prevent potential loops
    if (msg.text === undefined || msg.subtype) {
      return;
    }

    // Send initial "thinking" message
    const initialResponse = await say(
      createSearchMessageBlocks({
        text: 'Thinking...',
        query: msg.text,
        isSearching: true,
      })
    );

    if (!initialResponse.ts) {
      throw new Error('Failed to get message timestamp');
    }

    // Initialize message updater
    const messageUpdater = new MessageUpdater(
      app,
      message.channel,
      initialResponse.ts,
      config.slack.botToken,
      msg.text
    );

    // Process with Claude
    const response = await callClaude(msg.text, msg.user, text => {
      messageUpdater.update(text);
    }, true);

    // Check if response is a tool use
    const toolUseBlocks = response?.content.filter(
      (content): content is ToolUseBlock => content.type === 'tool_use'
    );

    // Show final results
    const textContent = response?.content
      .filter(content => content.type === 'text')
      .map(content => content.text)
      .join('\n');

    if (toolUseBlocks.length) {
      const firstToolUse = toolUseBlocks[0];
      // making button a new message to avoid previous message upading
      await app.client.chat.postMessage({
        token: config.slack.botToken,
        channel: message.channel,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Please grant permission to execute',
            },
            accessory: {
              type: 'button',
              text: {
                type: 'plain_text',
                text: firstToolUse.name,
              },
              action_id: firstToolUse.name,
              value: msg.text,
            },
          },
        ],
        text: 'Please grant permission to execute',
      });
    } else {
      await app.client.chat.update({
        token: config.slack.botToken,
        channel: message.channel,
        ts: initialResponse.ts,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: textContent || 'No response generated',
            },
          },
        ],
        text: textContent || 'No response generated',
      });
    }
  } catch (error) {
    logger.error('Failed to process message:', error);
    await say(`Sorry, I encountered an error: ${error}`);
  }
};
