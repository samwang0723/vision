interface SearchMessageBlocks {
  text: string;
  query: string;
  isSearching?: boolean;
}

interface SearchMessageResult {
  blocks: Array<{
    type: string;
    text?: {
      type: string;
      text: string;
    };
    elements?: Array<{
      type: string;
      text: string;
    }>;
  }>;
  text: string;
}

export const createSearchMessageBlocks = ({
  text,
  query,
  isSearching = false,
}: SearchMessageBlocks): SearchMessageResult => {
  // Truncate text to stay within Slack's 3000 character limit
  const MAX_TEXT_LENGTH = 2900; // Leaving some buffer
  const truncatedText =
    text.length > MAX_TEXT_LENGTH
      ? text.substring(0, MAX_TEXT_LENGTH) +
        '... (truncated due to Slack message size limits)'
      : text;

  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: isSearching
            ? '*Searching ...*'
            : `*Search Results:*\n${truncatedText}`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `🔍 Search query: "${query}"`,
          },
        ],
      },
    ],
    text: isSearching ? 'Searching ...' : truncatedText,
  };
};
