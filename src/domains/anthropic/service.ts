/* eslint-disable @typescript-eslint/no-explicit-any */
import Anthropic from '@anthropic-ai/sdk';
import config from '@/config';
import type { Message } from '@anthropic-ai/sdk/resources/messages';
import { Tool } from '@anthropic-ai/sdk/resources/messages/messages';
import { ToolUseBlock } from '@anthropic-ai/sdk/resources/messages/messages';
import { MessageParam } from '@anthropic-ai/sdk/resources/messages/messages';
import { runTool } from '@domains/mcp/mcp';
import { Primitive } from '@domains/mcp/types';
import { MessageQueueManager } from './messageQueue';
import logger from '@/utils/logger';

const messageManager = new MessageQueueManager();
const tools: Tool[] = [];

const DEFAULT_SYSTEM_PROMPT = `You are an AI assistant with access to various tools and services. Please follow these important guidelines when using specific tools:
- While searching restaurants, please perform as professional personal assistant to evaluate the condition I provided, do not ask too many questions for me to choose, pick the best suitable selection for me, checking the reservation options and guide how to do the reservation.
  also list down the Signature Dishes from that restaurant and Approximately pricing per person. When booking info has booking url using external url, use the mcp browse tool to work and find reservation steps.do not feedback each of the steps, if online booking url is provided,
  directly booking for me, only asking me if there's credit card information required`;

export const anthropic = new Anthropic({
  apiKey: config.anthropic.apiKey,
});

export function mapToolsToAnthropic(primitives: Primitive[]): void {
  if (!primitives || !Array.isArray(primitives)) {
    return;
  }

  const filteredTools = primitives
    .filter((p: Primitive) => p.type === 'tool')
    .map((p: Primitive) => ({
      name: p.value.name,
      description: p.value.description,
      input_schema: {
        type: 'object' as const,
        properties: p.value.inputSchema.properties,
        required: p.value.inputSchema.required,
      },
    }));

  tools.push(...filteredTools);
}

export async function callClaude(
  prompt: string | MessageParam[],
  userId: string,
  onStream?: (text: string) => void,
  resetMessages?: boolean,
  systemPrompt?: string
): Promise<Message> {
  try {
    if (resetMessages) {
      messageManager.resetQueue(userId);
    }
    if (Array.isArray(prompt)) {
      messageManager.addMessages(userId, prompt);
    } else {
      messageManager.addMessage(userId, {
        role: 'user',
        content: prompt,
      });
    }

    const messages = messageManager.getQueue(userId, 6);
    const tokenCount = messageManager.getTokenCount(userId);

    logger.info(
      `Calling Claude for user ${userId} with ${tokenCount} tokens in context`
    );

    const streamOptions: any = {
      model: 'claude-sonnet-4-20250514',
      temperature: 0.5,
      max_tokens: 10000,
      messages: messages,
      tools: tools,
    };

    // Add system prompt if provided
    if (systemPrompt) {
      streamOptions.system = systemPrompt;
    } else {
      // Use default system prompt if none provided
      streamOptions.system = DEFAULT_SYSTEM_PROMPT;
    }

    const stream = anthropic.messages.stream(streamOptions).on('text', text => {
      onStream?.(text);
    });

    const message = await stream.finalMessage();
    messageManager.addMessage(userId, {
      role: 'assistant',
      content: message.content,
    });

    return message;
  } catch (error: any) {
    logger.error(`Error calling Claude: ${error.message}`, error);

    // Check if it's a token limit error
    if (error.message && error.message.includes('tokens > 200000 maximum')) {
      logger.warn(
        'Token limit exceeded, trimming message history and retrying'
      );

      // Force a more aggressive trim by temporarily lowering the limit
      const originalMessages = messageManager.getQueue(userId);

      // Reset and only keep the most recent user message
      messageManager.resetQueue(userId);

      if (originalMessages.length > 0) {
        // Find the most recent user message
        const lastUserMessage = [...originalMessages]
          .reverse()
          .find(msg => msg.role === 'user');

        if (lastUserMessage) {
          messageManager.addMessage(userId, lastUserMessage);

          // Try again with just the last message
          logger.info(
            'Retrying Claude call with only the most recent user message'
          );
          return callClaude(
            'I apologize, but I had to clear our conversation history due to length constraints. Could you please restate your most recent question?',
            userId,
            onStream,
            undefined,
            systemPrompt
          );
        }
      }

      // If we couldn't find a user message, send a generic response
      return {
        id: 'error-recovery',
        content: [
          {
            type: 'text',
            text: 'I apologize, but our conversation has become too long for me to process. Could you please start a new conversation or ask your question again in a more concise way?',
          },
        ],
        model: 'claude-sonnet-4-20250514',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: 0, output_tokens: 0 },
      } as Message;
    }

    // For other errors, return a generic error message
    return {
      id: 'error',
      content: [
        {
          type: 'text',
          text: `I'm sorry, I encountered an error: ${error.message}. Please try again.`,
        },
      ],
      model: 'claude-sonnet-4-20250514',
      role: 'assistant',
      stop_reason: 'end_turn',
      stop_sequence: null,
      type: 'message',
      usage: { input_tokens: 0, output_tokens: 0 },
    } as Message;
  }
}

export async function processResponse(
  response: Message,
  userId: string,
  onStream?: (text: string) => void,
  systemPrompt?: string
): Promise<Message | void> {
  const toolUseBlocks = response.content.filter(
    (content: any): content is ToolUseBlock => content.type === 'tool_use'
  );

  if (toolUseBlocks.length) {
    const allToolResultPromises = toolUseBlocks.map(
      async (toolBlock: ToolUseBlock) => {
        return await callTool(toolBlock);
      }
    );
    const allToolResults = await Promise.all(allToolResultPromises);

    return await callClaude(
      allToolResults,
      userId,
      onStream,
      undefined,
      systemPrompt
    ).then(response =>
      processResponse(response, userId, onStream, systemPrompt)
    );
  }

  return response;
}

async function callTool(toolBlock: ToolUseBlock): Promise<MessageParam> {
  const { name, id, input } = toolBlock;
  const tool = tools.find(tool => tool.name === name);
  if (tool) {
    const toolOutput = await runTool(name, input as Record<string, any>);
    return {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: id,
          content: toolOutput.content,
        },
      ],
    } as MessageParam;
  } else {
    throw Error(`Tool ${name} does not exist`);
  }
}
