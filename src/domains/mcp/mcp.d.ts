export function runWithCommand(command: string, args: string[]): Promise<any>;
export function runWithConfig(configPath?: string): Promise<void>;
export function runWithSSE(uri: string): Promise<void>;
export function runTool(tool: string, args: unknown): Promise<any>;
