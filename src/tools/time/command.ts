import logger from '@/utils/logger';
import { runWithCommand } from '@domains/mcp/mcp';
import { Primitive } from '@domains/mcp/types';
import { mapToolsToAnthropic } from '@/domains/anthropic/service';

export async function initTimeTools(): Promise<void> {
  try {
    const primitives = await startServer();
    mapToolsToAnthropic(primitives);
    logger.info('Time tools initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Time tools:', error);
    throw error;
  }
}

async function startServer(): Promise<Primitive[]> {
  try {
    const command = 'docker';
    const args = ['run', '--rm', '-i', 'mcp/time'];

    return await runWithCommand(command, args, 'time');
  } catch (error) {
    logger.error('Failed to execute MCP command');
    throw error;
  }
}
