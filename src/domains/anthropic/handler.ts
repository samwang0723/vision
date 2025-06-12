import { ToolUseBlock } from '@anthropic-ai/sdk/resources/messages';
import { Message } from './types';
import { callClaude, processResponseWithNewMessages } from './service';
import logger from '@utils/logger';

export const messageHandler = async ({
  data,
  userId,
  userProfile,
  onNewClaude,
}: Message): Promise<void> => {
  try {
    // do not process if data is empty
    if (!data) {
      return;
    }

    // Create new message for initial Claude call
    if (onNewClaude) {
      const messageController = await onNewClaude();

      // Process with Claude - include userProfile for personalized system prompt
      const response = await callClaude(
        data,
        userId,
        text => {
          messageController.updateMessage(text);
          logger.info(text);
        },
        undefined,
        undefined,
        userProfile
      );

      // Show final results
      const textContent = response?.content
        .filter(content => content.type === 'text')
        .map(content => content.text)
        .join('\n');
      messageController.flushMessages(textContent);

      // Check if response is a tool use
      const toolUseBlocks = response?.content.filter(
        (content): content is ToolUseBlock => content.type === 'tool_use'
      );

      if (toolUseBlocks.length) {
        logger.info('Tool selected:', toolUseBlocks[0]);

        // Process response - pass userProfile to subsequent calls
        await processResponseWithNewMessages(
          response,
          userId,
          onNewClaude,
          1,
          userProfile
        );
      }
    }
  } catch (error) {
    logger.error('Failed to process message:', error);
  }
};
