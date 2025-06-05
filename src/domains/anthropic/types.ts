export interface Message {
  data: string;
  userId: string;
  onNewClaude?: () => Promise<{
    updateMessage: (text: string) => Promise<void>;
    flushMessages: (text: string) => Promise<void>;
  }>;
}
