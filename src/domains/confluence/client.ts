import { ApiClient } from '@/lib/apiClient';
import {
  ConfluenceSearchResult,
  ConfluenceContent,
  ConfluenceSearchOptions,
  ConfluencePage,
} from './types';
import config from '@config/index';
import { convert } from 'html-to-text';
import logger from '@utils/logger';

export class ConfluenceClient {
  private client: ApiClient;

  constructor() {
    this.client = new ApiClient({
      baseURL: config.confluence.baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      auth: {
        username: config.confluence.apiUser,
        password: config.confluence.apiKey,
      },
    });
  }

  async searchContent(
    options: ConfluenceSearchOptions
  ): Promise<ConfluenceContent[]> {
    const { keyword, spaceKey, limit = 10 } = options;
    let cql = `text ~ "${keyword}" AND type=page`;

    if (spaceKey) {
      cql += ` AND space="${spaceKey}"`;
    }

    const query = encodeURIComponent(cql);
    const result = await this.client.get<ConfluenceSearchResult>(
      `/rest/api/search?cql=${query}&limit=${limit}`
    );

    const pages = await Promise.all(
      result.results.map(item => this.getPageContent(item.content.id))
    );

    return pages.map(page => ({
      id: page.id,
      title: page.title,
      body: this.convertHtmlToText(page.body.export_view.value),
      url: config.confluence.baseUrl + page._links.webui,
    }));
  }

  private async getPageContent(id: string): Promise<ConfluencePage> {
    // IMPORTANT: The body-format is set to export_view to get the correct format of the page
    return this.client.get<ConfluencePage>(
      `/api/v2/pages/${id}?body-format=export_view`
    );
  }

  private convertHtmlToText(html: string): string {
    try {
      return convert(html, {
        wordwrap: false,
        preserveNewlines: false,
        selectors: [
          { selector: 'a', options: { ignoreHref: true }, format: 'inline' },
          { selector: 'img', format: 'skip' },
          {
            selector: 'pre',
            format: 'blockCode',
            options: {
              leadingLineBreaks: 0,
              trailingLineBreaks: 0,
            },
          },
          {
            selector: 'code',
            format: 'inlineCode',
          },
          // Handle headings individually
          {
            selector: 'h1',
            format: 'heading',
            options: {
              uppercase: false,
              leadingLineBreaks: 0,
              trailingLineBreaks: 0,
            },
          },
          {
            selector: 'h2',
            format: 'heading',
            options: {
              uppercase: false,
              leadingLineBreaks: 0,
              trailingLineBreaks: 0,
            },
          },
          {
            selector: 'h3',
            format: 'heading',
            options: {
              uppercase: false,
              leadingLineBreaks: 0,
              trailingLineBreaks: 0,
            },
          },
          {
            selector: 'h4',
            format: 'heading',
            options: {
              uppercase: false,
              leadingLineBreaks: 0,
              trailingLineBreaks: 0,
            },
          },
          {
            selector: 'h5',
            format: 'heading',
            options: {
              uppercase: false,
              leadingLineBreaks: 0,
              trailingLineBreaks: 0,
            },
          },
          {
            selector: 'h6',
            format: 'heading',
            options: {
              uppercase: false,
              leadingLineBreaks: 0,
              trailingLineBreaks: 0,
            },
          },
          {
            selector: 'ul',
            format: 'list',
            options: {
              itemPrefix: ' • ',
            },
          },
          {
            selector: 'ol',
            format: 'list',
            options: {
              itemPrefix: ' • ',
            },
          },
          {
            selector: 'sub',
            format: 'skip',
          },
        ],
        formatters: {
          blockCode: (elem, walk, builder, formatOptions) => {
            const language =
              elem.attribs?.class?.match(/language-(\w+)/)?.[1] || '';
            builder.addInline('\n```' + language + '\n');
            walk(elem.children, builder);
            builder.addInline('\n```\n');
          },
          inlineCode: (elem, walk, builder) => {
            builder.addInline('`');
            walk(elem.children, builder);
            builder.addInline('`');
          },
          heading: (elem, walk, builder, options) => {
            builder.addInline(' ');
            walk(elem.children, builder);
            builder.addInline(' ');
          },
          list: (elem, walk, builder, options) => {
            elem.children.forEach(item => {
              if (item.type === 'tag' && item.name === 'li') {
                builder.addInline(' • ');
                walk([item], builder);
              }
            });
          },
          confluenceMacro: (elem, walk, builder, options) => {
            const macroName = elem.attribs?.['ac:name'];
            if (macroName === 'code') {
              const codeContent =
                elem.children.find(
                  child =>
                    child.type === 'tag' && child.name === 'ac:plain-text-body'
                )?.children[0]?.data || '';

              builder.addInline('\n```\n');
              builder.addInline(codeContent);
              builder.addInline('\n```\n');
            } else {
              // For non-code macros, just walk through rich-text-body if present
              const richTextBody = elem.children.find(
                child =>
                  child.type === 'tag' && child.name === 'ac:rich-text-body'
              );
              if (richTextBody) {
                walk(richTextBody.children, builder);
              }
            }
          },
        },
      });
    } catch (error) {
      logger.error('Error converting HTML to text:', error);
      return '';
    }
  }
}
