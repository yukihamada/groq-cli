import axios from 'axios';
import { ToolResult } from '../types';

export class WebTool {
  async fetch(url: string): Promise<ToolResult> {
    try {
      // Validate URL
      const urlObj = new URL(url);
      
      // Only allow http and https protocols
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return {
          success: false,
          error: `Invalid URL protocol: ${urlObj.protocol}. Only HTTP and HTTPS are supported.`
        };
      }

      // Make the request with a timeout
      const response = await axios.get(url, {
        timeout: 30000, // 30 seconds
        headers: {
          'User-Agent': 'Groq-CLI/0.1.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        maxRedirects: 5
      });

      // Get content type
      const contentType = response.headers['content-type'] || '';
      
      // For HTML content, return a simplified version
      if (contentType.includes('text/html')) {
        // Basic HTML stripping - in production, you'd use a proper HTML parser
        let text = response.data
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        // Limit response size
        if (text.length > 10000) {
          text = text.substring(0, 10000) + '...\n\n[Content truncated due to length]';
        }
        
        return {
          success: true,
          output: `URL: ${url}\nStatus: ${response.status} ${response.statusText}\nContent-Type: ${contentType}\n\n${text}`
        };
      }
      
      // For JSON content
      if (contentType.includes('application/json')) {
        const jsonStr = JSON.stringify(response.data, null, 2);
        const truncated = jsonStr.length > 10000 
          ? jsonStr.substring(0, 10000) + '\n\n[JSON truncated due to length]'
          : jsonStr;
          
        return {
          success: true,
          output: `URL: ${url}\nStatus: ${response.status} ${response.statusText}\nContent-Type: ${contentType}\n\n${truncated}`
        };
      }
      
      // For other text content
      if (contentType.includes('text/')) {
        let text = response.data.toString();
        if (text.length > 10000) {
          text = text.substring(0, 10000) + '\n\n[Content truncated due to length]';
        }
        
        return {
          success: true,
          output: `URL: ${url}\nStatus: ${response.status} ${response.statusText}\nContent-Type: ${contentType}\n\n${text}`
        };
      }
      
      // For unsupported content types
      return {
        success: true,
        output: `URL: ${url}\nStatus: ${response.status} ${response.statusText}\nContent-Type: ${contentType}\n\n[Binary or unsupported content type]`
      };
      
    } catch (error: any) {
      if (error.code === 'ENOTFOUND') {
        return {
          success: false,
          error: `Could not resolve hostname for URL: ${url}`
        };
      }
      
      if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        return {
          success: false,
          error: `Request timeout while fetching URL: ${url}`
        };
      }
      
      if (error.response) {
        return {
          success: false,
          error: `HTTP ${error.response.status}: ${error.response.statusText} for URL: ${url}`
        };
      }
      
      return {
        success: false,
        error: `Failed to fetch URL: ${error.message}`
      };
    }
  }
}