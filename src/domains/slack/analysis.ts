import { SlackCommandMiddlewareArgs } from '@slack/bolt';
import { ConfluenceService } from '@/domains/confluence/service';
import logger from '@utils/logger';
import { ConfluenceSearchOptions } from '../confluence/types';

export const analysisHandler = async ({
  command,
  ack,
  respond,
}: SlackCommandMiddlewareArgs): Promise<void> => {
  // Acknowledge command request
  await ack();

  try {
    if (!command.text) {
      await respond(
        'Please provide a search term. Usage: /analysis search_term'
      );
      return;
    }

    const confluenceService = new ConfluenceService();
    const options: ConfluenceSearchOptions = {
      keyword: command.text,
      spaceKey: 'TMAB',
      limit: 3,
    };
    const summary = await confluenceService.getPageSummary(options);
    await respond({
      response_type: 'in_channel',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Search Results for "${command.text}"*\n\n${summary.slice(
              0,
              2000
            )}`,
          },
        },
      ],
    });
  } catch (error) {
    logger.error('Error searching Confluence:', error);
    await respond({
      response_type: 'ephemeral',
      text: 'Sorry, there was an error searching Confluence. Please try again later.',
    });
  }
};
