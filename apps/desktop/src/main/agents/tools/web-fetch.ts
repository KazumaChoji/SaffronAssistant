import type { Tool } from '../types';
import { AppConfig } from '../../config/app-config';

// Block private/internal IP ranges and sensitive URLs
function isBlockedUrl(urlStr: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return 'Invalid URL';
  }

  // Only allow http/https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `Blocked protocol: ${parsed.protocol}`;
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost and loopback
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') {
    return 'Blocked: localhost/loopback address';
  }

  // Block cloud metadata endpoints
  if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
    return 'Blocked: cloud metadata endpoint';
  }

  // Block private IP ranges (10.x, 172.16-31.x, 192.168.x)
  const parts = hostname.split('.');
  if (parts.length === 4 && parts.every(p => /^\d+$/.test(p))) {
    const octets = parts.map(Number);
    if (octets[0] === 10) return 'Blocked: private IP range (10.x.x.x)';
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return 'Blocked: private IP range (172.16-31.x.x)';
    if (octets[0] === 192 && octets[1] === 168) return 'Blocked: private IP range (192.168.x.x)';
  }

  return null;
}

export const webFetchTool: Tool<{ url: string }> = {
  name: 'web_fetch',
  description: 'Fetch and parse content from a web page',
  input_schema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to fetch (http/https only, no internal/private addresses)',
      },
    },
    required: ['url'],
  },
  permission: { permission: 'always', risk_level: 'safe' },

  async execute(input) {
    const blocked = isBlockedUrl(input.url);
    if (blocked) {
      return `Error: ${blocked}`;
    }

    const response = await fetch(input.url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return text.slice(0, AppConfig.tools.webFetchCharLimit);
  },
};
