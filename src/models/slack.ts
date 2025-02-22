export interface SlackMessage {
  user: string;
  text: string;
  type: string;
  ts: string;
  channel: string;
}

export interface SlackBlock {
  type: 'section';
  text: {
    type: 'mrkdwn' | 'plain_text';
    text: string;
  };
  accessory?: {
    type: 'button';
    text: {
      type: 'plain_text';
      text: string;
    };
    action_id: string;
  };
}

export interface SlackMessageResponse {
  blocks: SlackBlock[];
  text: string;
} 