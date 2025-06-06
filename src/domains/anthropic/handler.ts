import { ToolUseBlock } from '@anthropic-ai/sdk/resources/messages';
import { Message } from './types';
import { callClaude, processResponse } from './service';
import { runTool } from '@domains/mcp/mcp';
import logger from '@utils/logger';

export const messageHandler = async ({
  data,
  userId,
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

      // Process with Claude
      const response = await callClaude(data, userId, text => {
        messageController.updateMessage(text);
        logger.info(text);
      });

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

        // Process response - this will create new messages for each subsequent callClaude
        await processResponseWithNewMessages(response, userId, onNewClaude, 1);
      }
    }
  } catch (error) {
    logger.error('Failed to process message:', error);
  }
};

// New function to handle processResponse with new message creation
async function processResponseWithNewMessages(
  response: any,
  userId: string,
  onNewClaude: () => Promise<{
    updateMessage: (text: string) => Promise<void>;
    flushMessages: (text: string) => Promise<void>;
  }>,
  depth: number = 0
): Promise<void> {
  const MAX_DEPTH = 10; // Prevent infinite loops

  if (depth > MAX_DEPTH) {
    logger.warn(
      `Maximum recursion depth (${MAX_DEPTH}) reached, stopping tool processing`
    );
    const messageController = await onNewClaude();
    messageController.flushMessages(
      'Maximum recursion depth reached, stopping tool processing'
    );
    return;
  }
  const toolUseBlocks = response.content.filter(
    (content: any): content is ToolUseBlock => content.type === 'tool_use'
  );

  logger.info(`Processing ${toolUseBlocks.length} tools at depth ${depth}`);

  if (toolUseBlocks.length) {
    logger.info('Tool selected:', toolUseBlocks[0]);

    // Create tool results
    const allToolResultPromises = toolUseBlocks.map(
      async (toolBlock: ToolUseBlock) => {
        const { name, id, input } = toolBlock;

        const toolOutput = await runTool(name, input as Record<string, any>);
        return {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: id,
              content: toolOutput.content,
            },
          ],
        };
      }
    );

    const allToolResults = await Promise.all(allToolResultPromises);

    // Create new message for the next callClaude
    const messageController = await onNewClaude();

    // Call Claude again with tool results
    const followUpResponse = await callClaude(allToolResults, userId, text => {
      messageController.updateMessage(text);
      logger.info(text);
    });

    // Show final results for this step
    const textContent = followUpResponse?.content
      .filter(content => content.type === 'text')
      .map(content => content.text)
      .join('\n');

    if (textContent.trim()) {
      await messageController.flushMessages(textContent);
    }

    // Check if there are more tools to process
    const moreToolUseBlocks = followUpResponse.content.filter(
      (content: any): content is ToolUseBlock => content.type === 'tool_use'
    );

    if (moreToolUseBlocks.length) {
      logger.info(
        `Found ${moreToolUseBlocks.length} more tools, continuing recursion`
      );
      // Recursively process more tools (each will create new messages)
      await processResponseWithNewMessages(
        followUpResponse,
        userId,
        onNewClaude,
        depth + 1
      );
    } else {
      logger.info('No more tools to process, ending recursion');
    }
  }
}
