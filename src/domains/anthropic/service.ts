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
import { normalizeToolContent } from '@/utils/contentNormalizer';
import { readFileSync } from 'fs';
import { join } from 'path';

const messageManager = new MessageQueueManager();
const tools: Tool[] = [];
const model = 'claude-sonnet-4-20250514';

// Load system prompt from file
function loadSystemPrompt(): string {
  try {
    const promptPath = join(__dirname, '../../config/system-prompt.txt');
    return readFileSync(promptPath, 'utf-8').trim();
  } catch (error) {
    logger.error('Failed to load system prompt from file:', error);
    // Fallback to a basic prompt if file loading fails
    return 'You are a professional personal assistant with access to various tools and services.';
  }
}

export const DEFAULT_SYSTEM_PROMPT = loadSystemPrompt();

// Create personalized system prompt with user information
export function createPersonalizedSystemPrompt(userProfile?: {
  full_name?: string;
  first_name?: string;
  username?: string;
  language_code?: string;
  email?: string;
  phone?: string;
}): string {
  let personalizedPrompt = DEFAULT_SYSTEM_PROMPT;

  if (userProfile) {
    const userName =
      userProfile.full_name ||
      userProfile.first_name ||
      userProfile.username ||
      'there';
    let userInfo = `\n\nUSER CONTEXT:\n- User's name: ${userName}`;

    if (userProfile.language_code) {
      userInfo += `\n- User's language preference: ${userProfile.language_code}`;
    }

    if (userProfile.email) {
      userInfo += `\n- User's email: ${userProfile.email}`;
    }

    if (userProfile.phone) {
      userInfo += `\n- User's phone: ${userProfile.phone}`;
    }

    personalizedPrompt += userInfo;
    personalizedPrompt += `\n- Always address the user by their name when appropriate and maintain a friendly, personal tone.`;

    if (userProfile.email || userProfile.phone) {
      personalizedPrompt += `\n- When making restaurant reservations, use the provided contact information directly without asking the user.`;
    }
  }

  return personalizedPrompt;
}

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
  systemPrompt?: string,
  userProfile?: {
    full_name?: string;
    first_name?: string;
    username?: string;
    language_code?: string;
    email?: string;
    phone?: string;
  }
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
      model: model,
      temperature: 0.6,
      max_tokens: 300,
      messages: messages,
      tools: tools,
    };

    // Add system prompt - prioritize custom, then personalized, then default
    if (systemPrompt) {
      streamOptions.system = systemPrompt;
    } else if (userProfile) {
      streamOptions.system = createPersonalizedSystemPrompt(userProfile);
    } else {
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
            systemPrompt,
            userProfile
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
        model: model,
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
      model: model,
      role: 'assistant',
      stop_reason: 'end_turn',
      stop_sequence: null,
      type: 'message',
      usage: { input_tokens: 0, output_tokens: 0 },
    } as Message;
  }
}

export async function processResponseWithNewMessages(
  response: any,
  userId: string,
  onNewClaude: () => Promise<{
    updateMessage: (text: string) => Promise<void>;
    flushMessages: (text: string) => Promise<void>;
  }>,
  depth: number = 0,
  userProfile?: {
    full_name?: string;
    first_name?: string;
    username?: string;
    language_code?: string;
    email?: string;
    phone?: string;
  }
): Promise<void> {
  const MAX_DEPTH = 20; // Prevent infinite loops

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
        // logger.info('>>> Tool output:', toolOutput.content);

        // Handle tool output content - check if it contains images and normalize structure
        const normalizedContent = normalizeToolContent(toolOutput.content);

        return {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: id,
              content: normalizedContent,
            },
          ],
        };
      }
    );

    const allToolResults = await Promise.all(allToolResultPromises);

    // Create new message for the next callClaude
    const messageController = await onNewClaude();

    // Call Claude again with tool results
    const followUpResponse = await callClaude(
      allToolResults,
      userId,
      text => {
        messageController.updateMessage(text);
        logger.info(text);
      },
      undefined,
      DEFAULT_SYSTEM_PROMPT,
      userProfile
    );

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
        depth + 1,
        userProfile
      );
    } else {
      logger.info('No more tools to process, ending recursion');
    }
  }
}
