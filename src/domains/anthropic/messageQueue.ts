import type { Message } from '@anthropic-ai/sdk/resources/messages';
import { MessageParam } from '@anthropic-ai/sdk/resources/messages/messages';
import { anthropic } from './service';
import logger from '@/utils/logger';

// Maximum token limit for Claude 3.5 Sonnet
const MAX_TOKEN_LIMIT = 180000; // Setting a bit lower than the actual 200k limit for safety

export type { Message };
export class MessageQueueManager {
  private messageQueues: Map<string, MessageParam[]>;
  private tokenCounts: Map<string, number>;

  constructor() {
    this.messageQueues = new Map();
    this.tokenCounts = new Map();
  }

  private isToolUseMessage(message: MessageParam): boolean {
    return (
      Array.isArray(message.content) &&
      message.content.some(content => content.type === 'tool_use')
    );
  }

  private isToolResultMessage(message: MessageParam): boolean {
    return (
      Array.isArray(message.content) &&
      message.content.some(content => content.type === 'tool_result')
    );
  }

  private findLatestToolUse(queue: MessageParam[]): MessageParam | undefined {
    return [...queue].reverse().find(msg => this.isToolUseMessage(msg));
  }

  private ensureToolPairing(
    queue: MessageParam[],
    message: MessageParam
  ): MessageParam[] {
    const messagesToAdd: MessageParam[] = [];

    if (this.isToolResultMessage(message)) {
      const lastMessage = queue[queue.length - 1];

      // If last message is not tool_use, find and clone the latest tool_use
      if (!lastMessage || !this.isToolUseMessage(lastMessage)) {
        const latestToolUse = this.findLatestToolUse(queue);
        if (latestToolUse) {
          messagesToAdd.push({ ...latestToolUse });
        }
      }
    }

    messagesToAdd.push(message);
    return messagesToAdd;
  }

  // Estimate token count for a message
  private estimateTokenCount(message: MessageParam): number {
    let tokenCount = 0;

    if (typeof message.content === 'string') {
      // Rough estimate: 1 token ≈ 4 characters for English text
      tokenCount = Math.ceil(message.content.length / 4);
    } else if (Array.isArray(message.content)) {
      // Process each content block
      for (const block of message.content) {
        if (block.type === 'text' && typeof block.text === 'string') {
          tokenCount += Math.ceil(block.text.length / 4);
        } else if (block.type === 'tool_use' || block.type === 'tool_result') {
          // Tool use/result blocks are typically JSON objects
          tokenCount += Math.ceil(JSON.stringify(block).length / 4);
        }
      }
    }

    // Add overhead for message metadata
    tokenCount += 20;

    return tokenCount;
  }

  // Update token count for a user
  private updateTokenCount(userId: string): void {
    const queue = this.messageQueues.get(userId) || [];
    let totalTokens = 0;

    for (const message of queue) {
      totalTokens += this.estimateTokenCount(message);
    }

    this.tokenCounts.set(userId, totalTokens);

    if (totalTokens > MAX_TOKEN_LIMIT) {
      logger.warn(
        `Token count for user ${userId} is high: ${totalTokens} tokens`
      );
    }
  }

  // Trim the queue to stay under token limit
  private trimQueueToTokenLimit(userId: string): void {
    const queue = this.messageQueues.get(userId);
    if (!queue || queue.length === 0) return;

    let totalTokens = this.tokenCounts.get(userId) || 0;

    // If we're under the limit, no need to trim
    if (totalTokens <= MAX_TOKEN_LIMIT) return;

    logger.info(
      `Trimming message queue for user ${userId}. Current tokens: ${totalTokens}`
    );

    // Keep removing oldest messages until we're under the limit
    // But always keep the first message if it exists
    let startIndex = 0;

    // Skip the first message if it exists (to preserve context)
    if (queue.length > 1) {
      startIndex = 1;
    }

    while (totalTokens > MAX_TOKEN_LIMIT && startIndex < queue.length) {
      const oldestMessage = queue[startIndex];
      const oldestTokens = this.estimateTokenCount(oldestMessage);

      // If this is part of a tool use/result pair, remove both
      if (
        this.isToolUseMessage(oldestMessage) &&
        startIndex + 1 < queue.length
      ) {
        const nextMessage = queue[startIndex + 1];
        if (this.isToolResultMessage(nextMessage)) {
          const nextTokens = this.estimateTokenCount(nextMessage);
          queue.splice(startIndex, 2); // Remove both messages
          totalTokens -= oldestTokens + nextTokens;
          continue;
        }
      }

      // Otherwise just remove the oldest message
      queue.splice(startIndex, 1);
      totalTokens -= oldestTokens;
    }

    this.tokenCounts.set(userId, totalTokens);
    logger.info(
      `After trimming, token count for user ${userId}: ${totalTokens}`
    );
  }

  getQueue(userId: string, limit?: number): MessageParam[] {
    if (!this.messageQueues.has(userId)) {
      this.messageQueues.set(userId, []);
      this.tokenCounts.set(userId, 0);
    }
    const queue = this.messageQueues.get(userId)!;

    // Filter messages based on tool_use and tool_result pairing
    const filteredQueue = queue.filter((msg, index) => {
      // Check if the message has tool_use content
      const hasToolUse =
        Array.isArray(msg.content) &&
        msg.content.some(content => content.type === 'tool_use');

      if (!hasToolUse) {
        return true; // Keep non-tool_use messages
      }

      // Check if the next message exists and has tool_result
      const nextMsg = queue[index + 1];
      if (!nextMsg) {
        return false; // Remove tool_use without next message
      }

      const hasToolResult =
        Array.isArray(nextMsg.content) &&
        nextMsg.content.some(content => content.type === 'tool_result');

      return hasToolResult; // Keep only if there's a matching tool_result
    });

    // If limit is specified and greater than 0
    if (limit && limit > 0) {
      // Get the last 'limit' messages while preserving pairs
      const limitedQueue: MessageParam[] = [];
      let i = filteredQueue.length - 1;

      while (i >= 0 && limitedQueue.length < limit) {
        const currentMsg = filteredQueue[i];

        // If current message is tool_result, include its tool_use pair
        if (this.isToolResultMessage(currentMsg) && i > 0) {
          const prevMsg = filteredQueue[i - 1];
          if (this.isToolUseMessage(prevMsg)) {
            // Add the pair only if we have space for both
            if (limitedQueue.length < limit - 1) {
              limitedQueue.unshift(currentMsg);
              limitedQueue.unshift(prevMsg);
              i -= 2;
              continue;
            } else {
              // If not enough space for the pair, skip both
              break;
            }
          }
        }

        // Add non-tool messages or tool_use with its result
        limitedQueue.unshift(currentMsg);
        i--;
      }

      return limitedQueue;
    }

    return [...filteredQueue];
  }

  resetQueue(userId: string): void {
    this.messageQueues.set(userId, []);
    this.tokenCounts.set(userId, 0);
  }

  addMessage(userId: string, message: MessageParam): void {
    if (!this.messageQueues.has(userId)) {
      this.messageQueues.set(userId, []);
      this.tokenCounts.set(userId, 0);
    }
    const queue = this.messageQueues.get(userId)!;
    const messagesToAdd = this.ensureToolPairing(queue, message);
    queue.push(...messagesToAdd);

    // Update token count and trim if necessary
    this.updateTokenCount(userId);
    this.trimQueueToTokenLimit(userId);
  }

  addMessages(userId: string, messages: MessageParam[]): void {
    if (!this.messageQueues.has(userId)) {
      this.messageQueues.set(userId, []);
      this.tokenCounts.set(userId, 0);
    }
    const queue = this.messageQueues.get(userId)!;

    messages.forEach(message => {
      const messagesToAdd = this.ensureToolPairing(queue, message);
      queue.push(...messagesToAdd);
    });

    // Update token count and trim if necessary
    this.updateTokenCount(userId);
    this.trimQueueToTokenLimit(userId);
  }

  // Get the current token count for a user
  getTokenCount(userId: string): number {
    return this.tokenCounts.get(userId) || 0;
  }
}
