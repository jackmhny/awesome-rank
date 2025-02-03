import { GithubListRanker } from '../../../pages/content/src/github-list-ranker/GithubListRanker';

console.log('Content script loaded. Current URL:', window.location.href);

// Add a flag to prevent multiple initializations
declare global {
  interface Window {
    githubListRankerInitialized?: boolean;
  }
}

function findReadmeContent(): Element | null {
  // Try different selectors for both traditional and new GitHub UI
  const selectors = [
    // Traditional GitHub UI
    '#readme',
    // New GitHub UI with React components
    'div[role="grid"] article.markdown-body',
    'react-partial article.markdown-body',
    // Most specific new UI selector
    '#repo-content-pjax-container article.markdown-body',
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      console.log('Found readme content using selector:', selector);
      return element;
    }
  }

  console.log('No readme content found with any known selector');
  return null;
}

function waitForReadme(): Promise<Element | null> {
  return new Promise((resolve) => {
    // First check if readme is already present
    const existingReadme = findReadmeContent();
    if (existingReadme) {
      console.log('Readme found immediately');
      resolve(existingReadme);
      return;
    }

    console.log('Setting up readme detection...');

    // Set up the mutation observer
    const observer = new MutationObserver((mutations, obs) => {
      const readme = findReadmeContent();
      if (readme) {
        console.log('Readme found via observer');
        obs.disconnect();
        resolve(readme);
      }
    });

    // Try to find the most appropriate container to observe
    const targets = [
      document.querySelector('#repo-content-pjax-container'),
      document.querySelector('react-partial'),
      document.querySelector('main'),
      document.body
    ];

    const target = targets.find(t => t) || document.body;
    console.log('Observing target:', target.tagName, target.id ? `#${target.id}` : '');

    observer.observe(target, {
      childList: true,
      subtree: true
    });

    // Set a timeout to prevent infinite waiting
    setTimeout(() => {
      observer.disconnect();
      const finalCheck = findReadmeContent();
      if (finalCheck) {
        console.log('Readme found in final timeout check');
        resolve(finalCheck);
      } else {
        console.log('Readme not found after timeout');
        resolve(null);
      }
    }, 5000);
  });
}

async function initializeRanker() {
  console.log('Checking if we should initialize ranker...');
  
  // Check if we're on a GitHub page
  if (window.location.hostname === 'github.com') {
    console.log('On GitHub page, waiting for readme...');
    
    const readme = await waitForReadme();
    if (readme) {
      console.log('Readme found, starting ranker...');
      new GithubListRanker();
    } else {
      console.log('No readme found, skipping ranker initialization');
    }
  } else {
    console.log('Not on GitHub page, skipping ranker initialization');
  }
}

// Handle both initial load and navigation
async function handleNavigation() {
  // Reset initialization flag on new navigation
  window.githubListRankerInitialized = false;
  await initializeRanker();
}

// Initialize on first load
if (document.readyState === 'loading') {
  console.log('Document still loading, waiting for DOMContentLoaded...');
  document.addEventListener('DOMContentLoaded', handleNavigation);
} else {
  console.log('Document already loaded, initializing immediately...');
  handleNavigation();
}

// Handle GitHub's Turbo navigation events
document.addEventListener('turbo:load', () => {
  console.log('Turbo navigation detected, reinitializing...');
  handleNavigation();
});

// Fallback for regular navigation
window.addEventListener('popstate', () => {
  console.log('Navigation detected via popstate, reinitializing...');
  handleNavigation();
}); 