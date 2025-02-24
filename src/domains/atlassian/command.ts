/* eslint-disable @typescript-eslint/no-explicit-any */
import logger from '@/utils/logger';
import { ConfluenceConfig } from '@domains/slack/action';
import { runWithCommand } from '@domains/mcp/mcp';
import { Primitive } from '@domains/mcp/types';
import config from '@/config';
import { mapToolsToAnthropic } from '../anthropic/service';

export async function initConfluenceTools(): Promise<void> {
  try {
    const primitives = await startConfluenceMcpServer({
      url: config.confluence.baseUrl,
      username: config.confluence.apiUser,
      token: config.confluence.apiKey,
    });
    mapToolsToAnthropic(primitives);
    logger.info('Confluence tools initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Confluence tools:', error);
    throw error;
  }
}

async function startConfluenceMcpServer(
  confluenceConfig: ConfluenceConfig
): Promise<Primitive[]> {
  try {
    const command = 'uvx';
    const args = [
      'mcp-atlassian',
      `--confluence-url=${confluenceConfig.url}`,
      `--confluence-username=${confluenceConfig.username}`,
      `--confluence-token=${confluenceConfig.token}`,
    ];

    return await runWithCommand(command, args);
  } catch (error) {
    logger.error('Failed to execute MCP command');
    throw error;
  }
}
