import { z } from 'zod';

const GitHubRepoResponseSchema = z.object({
  stargazers_count: z.number(),
  updated_at: z.string(),
  description: z.string().nullable(),
  topics: z.array(z.string()),
  full_name: z.string(),
  html_url: z.string(),
});

type GitHubRepoResponse = z.infer<typeof GitHubRepoResponseSchema>;

interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

export class GitHubApiService {
  private static readonly API_BASE = 'https://api.github.com';
  private static readonly STORAGE_KEY = 'github_api_token';
  private token: string | null = null;
  private rateLimitInfo: RateLimitInfo | null = null;
  private tokenLoaded = false;

  constructor() {
    this.loadToken();
  }

  private async loadToken() {
    try {
      const result = await chrome.storage.sync.get(GitHubApiService.STORAGE_KEY);
      this.token = result[GitHubApiService.STORAGE_KEY] || null;
      this.tokenLoaded = true;
      console.log('GitHub API token loaded:', this.token ? 'Present' : 'Not found');
    } catch (error) {
      console.error('Error loading GitHub API token:', error);
      this.tokenLoaded = true; // Still mark as loaded even if there was an error
    }
  }

  private async ensureTokenLoaded() {
    if (!this.tokenLoaded) {
      await this.loadToken();
    }
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Accept': 'application/vnd.github.v3+json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  private updateRateLimitInfo(headers: Headers) {
    this.rateLimitInfo = {
      limit: parseInt(headers.get('x-ratelimit-limit') || '0', 10),
      remaining: parseInt(headers.get('x-ratelimit-remaining') || '0', 10),
      reset: parseInt(headers.get('x-ratelimit-reset') || '0', 10),
    };

    console.log('Rate limit info:', {
      limit: this.rateLimitInfo.limit,
      remaining: this.rateLimitInfo.remaining,
      resetIn: Math.round((this.rateLimitInfo.reset * 1000 - Date.now()) / 1000 / 60) + ' minutes'
    });
  }

  private async handleRateLimit(): Promise<boolean> {
    if (!this.rateLimitInfo || this.rateLimitInfo.remaining > 0) {
      return true;
    }

    const resetTime = this.rateLimitInfo.reset * 1000;
    const now = Date.now();
    const waitTime = resetTime - now;

    if (waitTime <= 0) {
      return true;
    }

    console.log(`Rate limit exceeded. Waiting ${Math.round(waitTime / 1000)} seconds...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    return true;
  }

  private static parseGitHubUrl(url: string): { owner: string; repo: string } | null {
    try {
      // Remove any fragments (#) from the URL
      url = url.split('#')[0];
      
      // Try to parse as URL first
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        // If not a full URL, try to parse as a relative path
        if (url.startsWith('/')) {
          parsedUrl = new URL(`https://github.com${url}`);
        } else {
          parsedUrl = new URL(`https://github.com/${url}`);
        }
      }

      // Only process github.com URLs
      if (!parsedUrl.hostname.endsWith('github.com')) {
        return null;
      }

      // Split the pathname into segments
      const segments = parsedUrl.pathname.split('/').filter(Boolean);
      if (segments.length < 2) {
        return null;
      }

      // The first two segments are always owner and repo
      const [owner, repo] = segments;
      
      // Clean up the repo name (remove .git and any query parameters)
      const cleanRepo = repo.replace(/\.git$/, '').split('?')[0];

      return { owner, repo: cleanRepo };
    } catch (error) {
      console.warn('Error parsing GitHub URL:', url, error);
      return null;
    }
  }

  private static normalizeRepoUrl(url: string): string | null {
    const repoInfo = this.parseGitHubUrl(url);
    return repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : null;
  }

  public async fetchRepositoryData(url: string, retries = 3): Promise<GitHubRepoResponse | null> {
    await this.ensureTokenLoaded();

    const repoInfo = GitHubApiService.parseGitHubUrl(url);
    if (!repoInfo) {
      console.warn(`Invalid GitHub URL: ${url}`);
      return null;
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.handleRateLimit();

        const response = await fetch(
          `${GitHubApiService.API_BASE}/repos/${repoInfo.owner}/${repoInfo.repo}`,
          { headers: this.getHeaders() }
        );

        this.updateRateLimitInfo(response.headers);

        if (response.status === 404) {
          console.warn(`Repository not found: ${url}`);
          return null;
        }

        if (response.status === 403 || response.status === 429) {
          if (attempt < retries) {
            const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
            console.log(`Rate limited, waiting ${retryAfter} seconds before retry ${attempt + 1}...`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            continue;
          }
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return GitHubRepoResponseSchema.parse(data);
      } catch (error) {
        console.error(`Error fetching repo data for ${url} (attempt ${attempt}/${retries}):`, error);
        if (attempt === retries) return null;
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    return null;
  }

  public async fetchRepositoriesData(urls: string[]): Promise<Map<string, GitHubRepoResponse>> {
    await this.ensureTokenLoaded();

    // Deduplicate URLs by normalizing them to owner/repo format
    const uniqueRepos = new Map<string, string>();
    for (const url of urls) {
      const normalized = GitHubApiService.normalizeRepoUrl(url);
      if (normalized) {
        uniqueRepos.set(normalized, url);
      }
    }

    console.log(`Found ${uniqueRepos.size} unique repositories out of ${urls.length} URLs`);

    const results = new Map<string, GitHubRepoResponse>();
    const batchSize = this.token ? 10 : 5;
    const delayBetweenBatches = this.token ? 1000 : 2000;

    const uniqueUrls = Array.from(uniqueRepos.values());
    console.log(`Fetching ${uniqueUrls.length} repositories in batches of ${batchSize}...`);
    console.log(`Using ${this.token ? 'authenticated' : 'unauthenticated'} requests`);

    for (let i = 0; i < uniqueUrls.length; i += batchSize) {
      const batch = uniqueUrls.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(uniqueUrls.length / batchSize)}`);

      const batchPromises = batch.map(async (url) => {
        const data = await this.fetchRepositoryData(url);
        if (data) {
          // Store the result for all URLs that point to this repo
          const normalized = GitHubApiService.normalizeRepoUrl(url);
          if (normalized) {
            for (const [otherNormalized, otherUrl] of uniqueRepos.entries()) {
              if (otherNormalized === normalized) {
                results.set(otherUrl, data);
              }
            }
          }
        }
      });

      await Promise.all(batchPromises);

      if (i + batchSize < uniqueUrls.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    return results;
  }
} 