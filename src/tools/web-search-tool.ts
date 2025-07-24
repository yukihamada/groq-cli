import axios from 'axios';
import { ToolResult } from '../types';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export class WebSearchTool {
  private readonly ddgApiUrl = 'https://api.duckduckgo.com/';
  
  async search(query: string, limit: number = 5): Promise<ToolResult> {
    try {
      // First, try DuckDuckGo Instant Answer API
      const instantResponse = await axios.get(this.ddgApiUrl, {
        params: {
          q: query,
          format: 'json',
          no_redirect: '1',
          no_html: '1',
          skip_disambig: '1'
        },
        timeout: 10000
      });

      const results: SearchResult[] = [];
      
      // Extract results from DuckDuckGo response
      const data = instantResponse.data;
      
      // Check Abstract (main result)
      if (data.AbstractText && data.AbstractURL) {
        results.push({
          title: data.Heading || query,
          url: data.AbstractURL,
          snippet: data.AbstractText
        });
      }
      
      // Check RelatedTopics
      if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics.slice(0, limit - results.length)) {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.split(' - ')[0] || 'Related Result',
              url: topic.FirstURL,
              snippet: topic.Text
            });
          }
        }
      }
      
      // If no results from Instant Answers, fall back to HTML scraping
      if (results.length === 0) {
        // Use DuckDuckGo HTML search as fallback
        const htmlResponse = await axios.get('https://duckduckgo.com/html/', {
          params: {
            q: query,
            kl: 'us-en'
          },
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Groq-CLI/0.2.0; +https://github.com/yukihamada/groq-cli)'
          },
          timeout: 10000
        });
        
        // Basic HTML parsing (in production, use a proper HTML parser)
        const html = htmlResponse.data;
        const resultPattern = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([^<]+)</g;
        
        let match;
        while ((match = resultPattern.exec(html)) !== null && results.length < limit) {
          results.push({
            title: match[2].trim(),
            url: match[1],
            snippet: match[3].trim()
          });
        }
      }
      
      // Format results
      if (results.length > 0) {
        let output = `Search results for "${query}":\n\n`;
        
        results.forEach((result, index) => {
          output += `${index + 1}. ${result.title}\n`;
          output += `   URL: ${result.url}\n`;
          output += `   ${result.snippet}\n\n`;
        });
        
        return {
          success: true,
          output: output.trim()
        };
      } else {
        return {
          success: true,
          output: `No search results found for "${query}". You may want to try rephrasing your search or use the web_fetch tool with a specific URL.`
        };
      }
      
    } catch (error: any) {
      // If DuckDuckGo fails, provide alternative search URLs
      const alternativeSearches = [
        `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
        `https://search.brave.com/search?q=${encodeURIComponent(query)}`
      ];
      
      return {
        success: false,
        error: `Web search failed. You can try these search URLs with the web_fetch tool:\n${alternativeSearches.join('\n')}`
      };
    }
  }
}