import type { Message } from '@anthropic-ai/sdk/resources/messages';
import { MessageParam } from '@anthropic-ai/sdk/resources/messages/messages';

export type { Message };
export class MessageQueueManager {
  private messageQueues: Map<string, MessageParam[]>;

  constructor() {
    this.messageQueues = new Map();
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

  getQueue(userId: string, limit?: number): MessageParam[] {
    if (!this.messageQueues.has(userId)) {
      this.messageQueues.set(userId, []);
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
  }

  addMessage(userId: string, message: MessageParam): void {
    if (!this.messageQueues.has(userId)) {
      this.messageQueues.set(userId, []);
    }
    const queue = this.messageQueues.get(userId)!;
    const messagesToAdd = this.ensureToolPairing(queue, message);
    queue.push(...messagesToAdd);
  }

  addMessages(userId: string, messages: MessageParam[]): void {
    if (!this.messageQueues.has(userId)) {
      this.messageQueues.set(userId, []);
    }
    const queue = this.messageQueues.get(userId)!;

    messages.forEach(message => {
      const messagesToAdd = this.ensureToolPairing(queue, message);
      queue.push(...messagesToAdd);
    });
  }
}
