/* eslint-disable @typescript-eslint/no-explicit-any */
import logger from '@/utils/logger';
import { runWithCommand } from '@domains/mcp/mcp';
import { Primitive } from '@domains/mcp/types';
import config from '@/config';
import { mapToolsToAnthropic } from '../anthropic/service';

export async function initConfluenceTools(): Promise<void> {
  try {
    const primitives = await startServer();
    mapToolsToAnthropic(primitives);
    logger.info('Confluence tools initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Confluence tools:', error);
    throw error;
  }
}

async function startServer(): Promise<Primitive[]> {
  try {
    const command = 'uvx';
    const args = [
      'mcp-atlassian',
      `--confluence-url=${config.confluence.baseUrl}`,
      `--confluence-username=${config.confluence.apiUser}`,
      `--confluence-token=${config.confluence.apiKey}`,
      `--jira-url=${config.jira.baseUrl}`,
      `--jira-username=${config.jira.apiUser}`,
      `--jira-token=${config.jira.apiKey}`,
    ];

    return await runWithCommand(command, args);
  } catch (error) {
    logger.error('Failed to execute MCP command');
    throw error;
  }
}
