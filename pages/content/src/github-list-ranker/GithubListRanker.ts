import { GitHubApiService } from './GitHubApiService';

export class GithubListRanker {
  private readonly apiService: GitHubApiService;
  private static readonly README_SELECTORS = [
    'article.markdown-body',
    'react-partial article.markdown-body',
    '#readme article.markdown-body',
  ];

  constructor() {
    this.apiService = new GitHubApiService();
    this.initialize();
  }

  private async initialize() {
    console.log('GitHub List Ranker: Initializing...');
    
    // Check if we're on a GitHub page
    if (!this.isGitHubPage()) {
      return;
    }

    // Wait for readme content to be available
    const readmeContent = await this.waitForReadme();
    if (!readmeContent) {
      return;
    }

    // Start analyzing the page
    await this.analyzeCurrentPage(readmeContent);

    // Watch for navigation changes (e.g., when using Turbo navigation)
    this.watchForNavigation();
  }

  private isGitHubPage(): boolean {
    const currentUrl = window.location.href;
    console.log('Current URL:', currentUrl);
    console.log('Current path:', window.location.pathname);
    return window.location.hostname === 'github.com';
  }

  private async waitForReadme(): Promise<Element | null> {
    console.log('On GitHub page, waiting for readme...');
    
    for (const selector of GithubListRanker.README_SELECTORS) {
      const element = document.querySelector(selector);
      if (element) {
        console.log('Found readme content using selector:', selector);
        console.log('Readme found immediately');
        return element;
      }
    }

    // If not found immediately, wait for it
    return new Promise((resolve) => {
      const observer = new MutationObserver((mutations, obs) => {
        for (const selector of GithubListRanker.README_SELECTORS) {
          const element = document.querySelector(selector);
          if (element) {
            console.log('Found readme content using selector:', selector);
            obs.disconnect();
            resolve(element);
            return;
          }
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // Stop observing after 10 seconds
      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, 10000);
    });
  }

  private watchForNavigation() {
    // Watch for Turbo navigation events
    document.addEventListener('turbo:load', () => {
      console.log('Turbo navigation detected, reinitializing...');
      this.initialize();
    });
  }

  private isAwesomeList(readmeContent: Element): boolean {
    console.log('Readme content found, checking for awesome list indicators...');
    
    const pageTitle = document.title.toLowerCase();
    console.log('Page title:', pageTitle);

    const readmeText = readmeContent.textContent || '';
    console.log('Readme text length:', readmeText.length);
    
    const hasAwesomeWord = readmeText.toLowerCase().includes('awesome');
    console.log('Readme contains "awesome":', hasAwesomeWord);

    const isAwesome = hasAwesomeWord;
    console.log('Is awesome list?', isAwesome);
    
    return isAwesome;
  }

  private extractRepositoryLinks(readmeContent: Element): string[] {
    const links = Array.from(readmeContent.querySelectorAll('a')).map(a => a.href);
    console.log('Found', links.length, 'total links in readme');

    const repoLinks = links.filter(link => {
      if (link.includes('github.com') && !link.includes('/topics/') && !link.includes('/search?')) {
        console.log('Found repository link:', link);
        return true;
      }
      return false;
    });

    console.log('Extracted', repoLinks.length, 'repository links');
    return repoLinks;
  }

  private async analyzeCurrentPage(readmeContent: Element) {
    console.log('Readme found, starting ranker...');

    if (!this.isAwesomeList(readmeContent)) {
      return;
    }

    console.log('GitHub List Ranker: Awesome list detected!');
    console.log('GitHub List Ranker: Analyzing page content...');

    const repoLinks = this.extractRepositoryLinks(readmeContent);
    console.log('GitHub List Ranker: Found', repoLinks.length, 'repository links');

    if (repoLinks.length === 0) {
      return;
    }

    console.log('GitHub List Ranker: Fetching repository data...');
    const repoData = await this.apiService.fetchRepositoriesData(repoLinks);
    console.log('GitHub List Ranker: Fetched data for', repoData.size, 'repositories');

    // Sort repositories by stars
    const sortedRepos = Array.from(repoData.values())
      .sort((a, b) => b.stargazers_count - a.stargazers_count);

    // Log top 5 repositories
    console.log('Top 5 repositories by stars:');
    sortedRepos.slice(0, 5).forEach((repo, index) => {
      console.log(`${index + 1}. ${repo.full_name} (${repo.stargazers_count} stars)`);
    });
  }
} 