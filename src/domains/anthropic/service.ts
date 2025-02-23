/* eslint-disable @typescript-eslint/no-explicit-any */
import Anthropic from '@anthropic-ai/sdk';
import config from '@/config';
import { Message, Tool } from '@anthropic-ai/sdk/resources/messages/messages';
import { ToolUseBlock } from '@anthropic-ai/sdk/resources/messages/messages';
import { MessageParam } from '@anthropic-ai/sdk/resources/messages/messages';
import { runTool } from '@domains/mcp/mcp';

const messages: MessageParam[] = [];
let tools: Tool[] = [];

export const anthropic = new Anthropic({
  apiKey: config.anthropic.apiKey,
});

export function mapToolsToAnthropic(primitives: any): void {
  if (!primitives || !Array.isArray(primitives)) {
    return;
  }

  tools = primitives
    .filter((p: any) => p.type === 'tool')
    .map((p: any) => ({
      name: p.value.name,
      description: p.value.description,
      input_schema: {
        type: 'object',
        properties: p.value.inputSchema.properties,
        required: p.value.inputSchema.required,
      },
    }));
}

export async function callClaude(
  prompt: string | MessageParam[]
): Promise<Message> {
  if (Array.isArray(prompt)) {
    messages.push(...prompt);
  } else {
    messages.push({
      role: 'user',
      content: prompt,
    });
  }

  return anthropic.messages
    .create({
      model: 'claude-3-5-sonnet-latest',
      temperature: 0.5,
      max_tokens: 2048,
      messages: messages,
      tools: tools,
    })
    .then(response => {
      messages.push({ role: 'assistant', content: response.content });
      return response;
    });
}

export async function processResponse(
  response: Message
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

    return await callClaude(allToolResults).then(processResponse);
  }

  return response;
}

async function callTool(toolBlock: ToolUseBlock): Promise<MessageParam> {
  const { name, id, input } = toolBlock;
  const tool = tools.find(tool => tool.name === name);
  if (tool) {
    const toolOutput = await runTool(name, input);
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
