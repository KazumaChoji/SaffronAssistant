import type { Tool } from '../types';
import { AppConfig } from '../../config/app-config';

export const webSearchTool: Tool<{ query: string; num_results?: number }> = {
  name: 'web_search',
  description: 'Search the web for current information',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query',
      },
      num_results: {
        type: 'number',
        description: 'Number of results to return (default 5)',
      },
    },
    required: ['query'],
  },
  permission: { permission: 'always', risk_level: 'safe' },

  async execute(input) {
    try {
      const { search } = await import('duck-duck-scrape');

      const searchResults = await search(input.query, {
        safeSearch: AppConfig.tools.safeSearch as any,
      });

      if (!searchResults || !searchResults.results || searchResults.results.length === 0) {
        return `No results found for: "${input.query}"`;
      }

      const numResults = Math.min(input.num_results ?? 5, AppConfig.tools.searchMaxResults);
      const results = searchResults.results
        .slice(0, numResults)
        .map((result, index) => {
          return `${index + 1}. **${result.title}**
   URL: ${result.url}
   ${result.description || '(No description available)'}`;
        })
        .join('\n\n');

      return `Search results for "${input.query}":\n\n${results}`;
    } catch (error: any) {
      console.error('DuckDuckGo search error:', error);
      return `Error performing web search: ${error.message}. You may want to try web_fetch with a specific URL instead.`;
    }
  },
};
