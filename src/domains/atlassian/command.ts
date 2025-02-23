/* eslint-disable @typescript-eslint/no-explicit-any */
import logger from '@/utils/logger';
import { ConfluenceConfig } from '@domains/slack/action';
import { runWithCommand } from '@domains/mcp/mcp';

export async function handleMCPCommand(
  confluenceConfig: ConfluenceConfig
): Promise<any> {
  try {
    const command = 'uvx';
    const args = [
      'mcp-atlassian',
      `--confluence-url=${confluenceConfig.url}`,
      `--confluence-username=${confluenceConfig.username}`,
      `--confluence-token=${confluenceConfig.token}`,
    ];

    logger.info('>> Running MCP command:', command, args);

    return await runWithCommand(command, args);
  } catch (error) {
    logger.error('Failed to execute MCP command');
    throw error;
  }
}
