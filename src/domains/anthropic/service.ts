/* eslint-disable @typescript-eslint/no-explicit-any */
import Anthropic from '@anthropic-ai/sdk';
import config from '@/config';
import { Message, Tool } from '@anthropic-ai/sdk/resources/messages/messages';
import { ToolUseBlock } from '@anthropic-ai/sdk/resources/messages/messages';
import { MessageParam } from '@anthropic-ai/sdk/resources/messages/messages';
import { runTool } from '@domains/mcp/mcp';
import { Primitive } from '@domains/mcp/types';
import logger from '@/utils/logger';

class MessageQueueManager {
  private messageQueues: Map<string, MessageParam[]>;

  constructor() {
    this.messageQueues = new Map();
  }

  getQueue(userId: string): MessageParam[] {
    if (!this.messageQueues.has(userId)) {
      this.messageQueues.set(userId, []);
    }
    return this.messageQueues.get(userId)!;
  }

  resetQueue(userId: string): void {
    this.messageQueues.set(userId, []);
  }

  addMessage(userId: string, message: MessageParam): void {
    const queue = this.getQueue(userId);
    queue.push(message);
  }

  addMessages(userId: string, messages: MessageParam[]): void {
    const queue = this.getQueue(userId);
    queue.push(...messages);
  }
}

const messageManager = new MessageQueueManager();
const tools: Tool[] = [];

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
  resetMessages?: boolean
): Promise<Message> {
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

  const messages = messageManager.getQueue(userId);
  const stream = anthropic.messages
    .stream({
      model: 'claude-3-5-sonnet-latest',
      temperature: 0.5,
      max_tokens: 2048,
      messages: messages,
      tools: tools,
    })
    .on('text', text => {
      onStream?.(text);
    });

  const message = await stream.finalMessage();
  messageManager.addMessage(userId, { role: 'assistant', content: message.content });
  logger.info('message', message);
  return message;
}

export async function processResponse(
  response: Message,
  userId: string,
  onStream?: (text: string) => void
): Promise<Message | void> {
  const toolUseBlocks = response.content.filter(
    (content): content is ToolUseBlock => content.type === 'tool_use'
  );

  if (toolUseBlocks.length) {
    const allToolResultPromises = toolUseBlocks.map(
      async (toolBlock: ToolUseBlock) => {
        return await callTool(toolBlock);
      }
    );
    const allToolResults = await Promise.all(allToolResultPromises);

    return await callClaude(allToolResults, userId, onStream).then(response =>
      processResponse(response, userId, onStream)
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
