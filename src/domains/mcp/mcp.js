import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { LoggingMessageNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { Console } from 'node:console';

let client = null;
const logger = new Console({
  stdout: process.stderr,
  stderr: process.stderr,
});

async function createClient() {
  if (!client) {
    client = new Client(
      { name: 'vision', version: '1.0.0' },
      { capabilities: {} }
    );
    client.setNotificationHandler(
      LoggingMessageNotificationSchema,
      notification => {
        logger.debug('[server log]:', notification.params.data);
      }
    );
  }
  return client;
}

async function listPrimitives(client) {
  const capabilities = client.getServerCapabilities();
  const primitives = [];
  const promises = [];
  if (capabilities.resources) {
    promises.push(
      client.listResources().then(({ resources }) => {
        resources.forEach(item =>
          primitives.push({ type: 'resource', value: item })
        );
      })
    );
  }
  if (capabilities.tools) {
    promises.push(
      client.listTools().then(({ tools }) => {
        tools.forEach(item => primitives.push({ type: 'tool', value: item }));
      })
    );
  }
  if (capabilities.prompts) {
    promises.push(
      client.listPrompts().then(({ prompts }) => {
        prompts.forEach(item =>
          primitives.push({ type: 'prompt', value: item })
        );
      })
    );
  }
  await Promise.all(promises);
  return primitives;
}

async function connectServer(transport) {
  const mcpClient = await createClient();
  await mcpClient.connect(transport);
  const primitives = await listPrimitives(mcpClient);

  logger.log(
    `Connected, server capabilities: ${Object.keys(
      mcpClient.getServerCapabilities()
    ).join(', ')}`
  );

  return primitives;
}

export async function runTool(name, args) {
  if (!client) {
    throw new Error('Client not connected');
  }
  return await client.callTool({ name, arguments: args }).catch(err => {
    logger.error('Error calling tool:', err);
    throw err;
  });
}

export async function runWithCommand(command, args) {
  const transport = new StdioClientTransport({ command, args });
  logger.info('Running MCP command:', transport);
  const primitives = await connectServer(transport);
  return primitives;
}

export async function runWithSSE(uri) {
  const transport = new SSEClientTransport(new URL(uri));
  await connectServer(transport);
}
