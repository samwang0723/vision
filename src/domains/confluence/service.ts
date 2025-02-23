import { ConfluenceClient } from './client';
import { ConfluenceContent, ConfluenceSearchOptions } from './types';
import logger from '@utils/logger';

export class ConfluenceService {
  private client: ConfluenceClient;

  constructor() {
    this.client = new ConfluenceClient();
  }

  async searchPages(
    options: string | ConfluenceSearchOptions
  ): Promise<ConfluenceContent[]> {
    try {
      const searchOptions: ConfluenceSearchOptions =
        typeof options === 'string' ? { keyword: options } : options;
      const results = await this.client.searchContent(searchOptions);
      logger.info(
        `Found ${results.length} pages for keyword: ${searchOptions.keyword}`
      );
      return results;
    } catch (error) {
      logger.error('Error searching Confluence pages:', error);
      throw error;
    }
  }

  async getPageSummary(
    options: string | ConfluenceSearchOptions
  ): Promise<string> {
    const pages = await this.searchPages(options);
    const searchOptions: ConfluenceSearchOptions =
      typeof options === 'string' ? { keyword: options } : options;

    if (pages.length === 0) {
      return `No pages found for keyword: ${searchOptions.keyword}`;
    }

    return pages
      .map(
        page =>
          `Title: ${page.title}\nURL: ${page.url}\n\nSummary:\n${page.body}...`
      )
      .join('\n\n---\n\n');
  }
}
