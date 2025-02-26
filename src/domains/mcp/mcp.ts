/* eslint-disable @typescript-eslint/no-explicit-any */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { LoggingMessageNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { Console } from 'node:console';
import { Primitive } from '@domains/mcp/types';

// Map to store clients by connection ID
const clientsMap: Map<string, Client> = new Map();
// Map to store tool names to their respective client IDs
const toolToClientMap: Map<string, string> = new Map();

const logger: Console = new Console({
  stdout: process.stderr,
  stderr: process.stderr,
});

async function createClient(connectionId: string): Promise<Client> {
  let client = clientsMap.get(connectionId);

  if (!client) {
    client = new Client(
      { name: connectionId, version: '1.0.0' },
      {
        capabilities: {
          prompts: {},
          resources: {},
          tools: {},
        },
      }
    );
    client.setNotificationHandler(
      LoggingMessageNotificationSchema,
      notification => {
        if (notification.params.data) {
          logger.debug(
            `[server log ${connectionId}]:`,
            notification.params.data
          );
        }
      }
    );
    clientsMap.set(connectionId, client);
  }

  return client;
}

async function listPrimitives(
  client: Client,
  connectionId: string
): Promise<Primitive[]> {
  const capabilities = client.getServerCapabilities() || {};
  const primitives: Primitive[] = [];
  const promises: Promise<void>[] = [];

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
        tools.forEach(item => {
          primitives.push({ type: 'tool', value: item });
          // Map each tool name to this client's connection ID
          toolToClientMap.set(item.name, connectionId);
        });
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

async function connectServer(
  transport: StdioClientTransport | SSEClientTransport,
  connectionId: string
): Promise<Primitive[]> {
  const mcpClient = await createClient(connectionId);
  await mcpClient.connect(transport);
  const primitives = await listPrimitives(mcpClient, connectionId);
  const capabilities = mcpClient.getServerCapabilities() || {};

  logger.log(
    `Connected (${connectionId}), server capabilities: ${Object.keys(
      capabilities
    ).join(', ')}`
  );

  return primitives;
}

export async function runTool(
  name: string,
  args: Record<string, any>
): Promise<any> {
  // Find the client ID associated with this tool
  const connectionId = toolToClientMap.get(name);

  if (!connectionId) {
    throw new Error(`No client found for tool: ${name}`);
  }

  // Get the client for this connection
  const client = clientsMap.get(connectionId);

  if (!client) {
    throw new Error(`Client not found for connection: ${connectionId}`);
  }

  return await client.callTool({ name, arguments: args }).catch(err => {
    logger.error(`Error calling tool (${connectionId}):`, err);
    throw err;
  });
}

export async function runWithCommand(
  command: string,
  args: string[],
  connectionId: string
): Promise<Primitive[]> {
  const transport = new StdioClientTransport({ command, args });
  logger.info(`Running MCP command (${connectionId}):`, transport);
  const primitives = await connectServer(transport, connectionId);
  return primitives;
}

export async function runWithSSE(
  uri: string,
  connectionId: string
): Promise<void> {
  const transport = new SSEClientTransport(new URL(uri));
  await connectServer(transport, connectionId);
}

// Utility functions

// Get all available tools
export function getAllTools(): string[] {
  return Array.from(toolToClientMap.keys());
}

// Get all connection IDs
export function getAllConnectionIds(): string[] {
  return Array.from(clientsMap.keys());
}

// Get client by connection ID
export function getClientByConnectionId(
  connectionId: string
): Client | undefined {
  return clientsMap.get(connectionId);
}

// Get connection ID by tool name
export function getConnectionIdByToolName(
  toolName: string
): string | undefined {
  return toolToClientMap.get(toolName);
}
