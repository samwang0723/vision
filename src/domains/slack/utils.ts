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
}: SearchMessageBlocks): SearchMessageResult => ({
  blocks: [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: isSearching
          ? '*Searching Confluence...*'
          : `*Search Results:*\n${text}`,
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
  text: isSearching ? 'Searching Confluence...' : text,
});
