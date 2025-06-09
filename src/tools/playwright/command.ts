import logger from '@/utils/logger';
import { runWithCommand } from '@domains/mcp/mcp';
import { Primitive } from '@domains/mcp/types';
import { mapToolsToAnthropic } from '@/domains/anthropic/service';

export async function initPlaywrightTools(): Promise<void> {
  try {
    const primitives = await startServer();
    mapToolsToAnthropic(primitives);
    logger.info('Playwright tools initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Playwright tools:', error);
    throw error;
  }
}

async function startServer(): Promise<Primitive[]> {
  try {
    const command = 'npx';
    const args = [
      '@playwright/mcp@latest',
      '--headless',
      '--isolated',
      '--ignore-https-errors',
      '--block-service-workers',
      '--user-agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ];

    return await runWithCommand(command, args, 'playwright');
  } catch (error) {
    logger.error('Failed to execute MCP command');
    throw error;
  }
}
