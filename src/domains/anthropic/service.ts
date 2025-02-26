/* eslint-disable @typescript-eslint/no-explicit-any */
import Anthropic from '@anthropic-ai/sdk';
import config from '@/config';
import type { Message } from '@anthropic-ai/sdk/resources/messages';
import { Tool } from '@anthropic-ai/sdk/resources/messages/messages';
import { ToolUseBlock } from '@anthropic-ai/sdk/resources/messages/messages';
import { MessageParam } from '@anthropic-ai/sdk/resources/messages/messages';
import { runTool } from '@domains/mcp/mcp';
import { Primitive } from '@domains/mcp/types';
import logger from '@/utils/logger';
import { MessageQueueManager } from './messageQueue';
import { initConfluenceTools } from '@domains/atlassian/command';
import { initSumologicTools } from '../sumologic/command';

const messageManager = new MessageQueueManager();
const tools: Tool[] = [];
let toolsInitialized = false;

export const anthropic = new Anthropic({
  apiKey: config.anthropic.apiKey,
});

export function mapToolsToAnthropic(primitives: Primitive[]): void {
  if (!primitives || !Array.isArray(primitives)) {
    logger.warn('No primitives provided to mapToolsToAnthropic');
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

  logger.info(`Found ${filteredTools.length} tools to register:`, filteredTools.map(t => t.name));

  // Deduplicate tools based on name before adding them
  const uniqueTools = filteredTools.filter(newTool => 
    !tools.some(existingTool => existingTool.name === newTool.name)
  );

  logger.info(`Registering ${uniqueTools.length} unique tools:`, uniqueTools.map(t => t.name));
  tools.push(...uniqueTools);
  logger.info(`Total registered tools: ${tools.length}`, tools.map(t => t.name));
}

export async function callClaude(
  prompt: string | MessageParam[],
  userId: string,
  onStream?: (text: string) => void,
  resetMessages?: boolean
): Promise<Message> {
  // Ensure tools are initialized
  if (!toolsInitialized) {
    try {
      await ensureToolsInitialized();
    } catch (error) {
      logger.error('Failed to initialize tools:', error);
    }
  }

  if (resetMessages) {
    messageManager.resetQueue(userId);
  }
  logger.info('messages', { prompt, userId });

  if (Array.isArray(prompt)) {
    messageManager.addMessages(userId, prompt);
  } else {
    messageManager.addMessage(userId, {
      role: 'user',
      content: prompt,
    });
  }

  const messages = messageManager.getQueue(userId, 6);
  logger.info('messages', { messages });
  logger.info('--------------------------------');
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
  messageManager.addMessage(userId, {
    role: 'assistant',
    content: message.content,
  });
  logger.info('message', messageManager.getQueue(userId, 6));
  logger.info('===============================');

  return message;
}

export async function processResponse(
  response: Message,
  userId: string,
  onStream?: (text: string) => void
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

    return await callClaude(allToolResults, userId, onStream).then(response =>
      processResponse(response, userId, onStream)
    );
  }

  return response;
}

async function callTool(toolBlock: ToolUseBlock): Promise<MessageParam> {
  const { name, id, input } = toolBlock;

  // Check if the tool exists in our registered tools
  const tool = tools.find(tool => tool.name === name);
  if (!tool) {
    logger.error(`Tool ${name} not found in registered tools. Available tools: ${tools.map(t => t.name).join(', ')}`);
    
    // Return a tool result with an error message instead of throwing
    return {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: id,
          content: [
            {
              type: 'text',
              text: `Error: Tool '${name}' is not available. Please try using one of the available tools or contact support.`
            }
          ],
        },
      ],
    } as MessageParam;
  }
  
  try {
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
  } catch (error: any) {
    logger.error(`Error executing tool ${name}:`, error);
    
    // Return a tool result with the error message
    return {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: id,
          content: [
            {
              type: 'text',
              text: `Error executing tool '${name}': ${error?.message || 'Unknown error'}`
            }
          ],
        },
      ],
    } as MessageParam;
  }
}

// Ensure all tools are properly initialized
async function ensureToolsInitialized(): Promise<void> {
  if (toolsInitialized) return;
  
  try {
    // Initialize tools
    await initConfluenceTools();
    await initSumologicTools();
    
    // Add other tool initializations here as needed
    
    toolsInitialized = true;
    logger.info('All tools initialized successfully. Available tools:', tools.map(t => t.name));
  } catch (error) {
    logger.error('Error initializing tools:', error);
    throw error;
  }
}
