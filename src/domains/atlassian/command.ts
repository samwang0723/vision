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
    const command = 'docker';
    const args = [
      'run',
      '--rm',
      '-i',
      `-e CONFLUENCE_URL=${config.confluence.baseUrl}`,
      `-e CONFLUENCE_USERNAME=${config.confluence.apiUser}`,
      `-e CONFLUENCE_API_TOKEN=${config.confluence.apiKey}`,
      `-e JIRA_URL=${config.jira.baseUrl}`,
      `-e JIRA_USERNAME=${config.jira.apiUser}`,
      `-e JIRA_API_TOKEN=${config.jira.apiKey}`,
      'mcp/atlassian',
    ];

    return await runWithCommand(command, args);
  } catch (error) {
    logger.error('Failed to execute MCP command');
    throw error;
  }
}
