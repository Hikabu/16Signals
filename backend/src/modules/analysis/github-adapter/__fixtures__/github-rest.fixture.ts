import { GithubRestData } from '../types';

export const GITHUB_REST_FIXTURE: GithubRestData = {
  repos: [
    {
      id: 101,
      name: 'complex-owned-repo',
      owner: { login: 'testuser' },
      fork: false,
      language: 'TypeScript',
      created_at: '2023-01-01T00:00:00Z',
      pushed_at: new Date().toISOString(),
    },
    {
      id: 102,
      name: 'tutorial-repo',
      owner: { login: 'testuser' },
      fork: false,
      language: 'CSS',
      created_at: '2023-01-01T00:00:00Z',
      pushed_at: new Date().toISOString(),
    },
    {
      id: 103,
      name: 'pure-fork',
      owner: { login: 'otheruser' },
      fork: true,
      language: 'TypeScript',
      created_at: '2023-01-01T00:00:00Z',
      pushed_at: new Date().toISOString(),
    },
    {
      id: 104,
      name: 'normal-fork',
      owner: { login: 'testuser' },
      fork: true,
      language: 'TypeScript',
      created_at: '2023-01-01T00:00:00Z',
      pushed_at: new Date().toISOString(),
    },
    {
      id: 105,
      name: 'another-owned',
      owner: { login: 'testuser' },
      fork: false,
      language: 'TypeScript',
      created_at: '2023-01-01T00:00:00Z',
      pushed_at: new Date().toISOString(),
    },
  ],
  languages: {
    '101': { TypeScript: 7000, CSS: 3000 },
    '102': { HTML: 1000, CSS: 9000 },
    '103': { TypeScript: 10000 },
    '104': { TypeScript: 5000, CSS: 5000 },
    '105': { TypeScript: 10000 },
  },
  commits: {
    '101': [
      { sha: 'c1', commit: { message: 'feat: init' } },
      { sha: 'c2', commit: { message: 'fix: bug' } },
    ],
    '102': [{ sha: 't1', commit: { message: 'tutorial start' } }],
    '103': [], // Pure fork with 0 original commits
    '104': [{ sha: 'f1', commit: { message: 'fork commit' } }],
    '105': [{ sha: 'a1', commit: { message: 'another commit' } }],
  },
};
