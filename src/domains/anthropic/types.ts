export interface Message {
  data: string;
  userId: string;
  userProfile?: {
    full_name?: string;
    first_name?: string;
    username?: string;
    language_code?: string;
    email?: string;
    phone?: string;
  };
  onNewClaude?: () => Promise<{
    updateMessage: (text: string) => Promise<void>;
    flushMessages: (text: string) => Promise<void>;
  }>;
}
