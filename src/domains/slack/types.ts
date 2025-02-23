export interface SlackMessage {
  user: string;
  text: string;
  type: string;
  ts: string;
  channel: string;
  subtype?: string; // Optional subtype for different message types
  thread_ts?: string; // Thread timestamp for threaded messages
}

export interface SlackBlock {
  type: 'section' | 'context';
  text?: {
    type: 'mrkdwn' | 'plain_text';
    text: string;
  };
  elements?: Array<{
    type: 'mrkdwn' | 'plain_text';
    text: string;
  }>;
  accessory?: {
    type: 'button';
    text: {
      type: 'plain_text';
      text: string;
    };
    action_id: string;
    value?: string;
  };
}

export interface SlackMessageResponse {
  blocks: SlackBlock[];
  text: string;
}
