export interface ConfluenceSearchOptions {
  keyword: string;
  spaceKey?: string;
  limit?: number;
}

export interface ConfluenceSearchResult {
  results: Array<{
    content: {
      id: string;
      type: string;
      status: string;
      title: string;
      _links: {
        webui: string;
      };
    };
  }>;
  start: number;
  limit: number;
  size: number;
}

export interface ConfluencePage {
  id: string;
  title: string;
  body: {
    export_view: {
      value: string;
      representation: string;
    };
  };
  _links: {
    webui: string;
  };
}

export interface ConfluenceContent {
  id: string;
  title: string;
  body: string;
  url: string;
}
