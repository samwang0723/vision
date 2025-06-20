/* eslint-disable @typescript-eslint/no-explicit-any */
import logger from '@/utils/logger';
import { runWithCommand } from '@domains/mcp/mcp';
import { Primitive } from '@domains/mcp/types';
import { mapToolsToAnthropic } from '@/domains/anthropic/service';

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
    const args = ['run', '--rm', '-i', 'mcp/atlassian'];

    return await runWithCommand(command, args, 'atlassian');
  } catch (error) {
    logger.error('Failed to execute MCP command');
    throw error;
  }
}
