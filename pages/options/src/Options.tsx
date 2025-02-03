import '@src/Options.css';
import React, { useEffect, useState } from 'react';

const Options: React.FC = () => {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    // Load existing token
    chrome.storage.sync.get('github_api_token', (result) => {
      if (result.github_api_token) {
        setToken(result.github_api_token);
        setStatus('Token loaded');
      }
    });
  }, []);

  const handleSave = () => {
    chrome.storage.sync.set(
      { github_api_token: token },
      () => {
        setStatus('Token saved successfully!');
        setTimeout(() => setStatus(''), 2000);
      }
    );
  };

  const handleClear = () => {
    chrome.storage.sync.remove('github_api_token', () => {
      setToken('');
      setStatus('Token cleared successfully!');
      setTimeout(() => setStatus(''), 2000);
    });
  };

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      <h1 className="text-2xl font-bold mb-4">GitHub List Ranker Options</h1>
      
      <div className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
        <div className="mb-6">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="token">
            GitHub Personal Access Token
          </label>
          <input
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            id="token"
            type="password"
            placeholder="Enter your GitHub token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <p className="text-sm text-gray-600 mt-2">
            This token is used to increase the GitHub API rate limit. Create one at{' '}
            <a
              href="https://github.com/settings/tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-700"
            >
              GitHub Settings → Developer settings → Personal access tokens
            </a>
            . Only the <code>public_repo</code> scope is needed.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <button
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            onClick={handleSave}
          >
            Save Token
          </button>
          <button
            className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            onClick={handleClear}
          >
            Clear Token
          </button>
        </div>

        {status && (
          <p className="mt-4 text-sm text-green-600 font-semibold">{status}</p>
        )}
      </div>
    </div>
  );
};

export default Options;
