import { GithubGraphQLData } from '../types';

export const GITHUB_GRAPHQL_FIXTURE: GithubGraphQLData = {
  pullRequests: [
    {
      id: 'pr1',
      state: 'MERGED',
      title: 'Feature: Authentication',
      createdAt: '2023-01-01T10:00:00Z',
      mergedAt: '2023-01-02T10:00:00Z',
      repository: {
        name: 'colossseum',
        owner: { login: 'arturo' },
        stargazerCount: 10,
      },
    },
    {
      id: 'pr2',
      state: 'MERGED',
      title: 'Security: Fix reentrancy',
      createdAt: '2023-01-05T10:00:00Z',
      mergedAt: '2023-01-06T10:00:00Z',
      repository: {
        name: 'solana',
        owner: { login: 'solana-labs' },
        stargazerCount: 15000,
      },
    },
    {
      id: 'pr3',
      state: 'MERGED',
      title: 'Improvement: Anchor IDL',
      createdAt: '2023-02-01T10:00:00Z',
      mergedAt: '2023-02-02T10:00:00Z',
      repository: {
        name: 'anchor',
        owner: { login: 'coral-xyz' },
        stargazerCount: 8000,
      },
    },
    {
      id: 'pr4',
      state: 'MERGED',
      title: 'Refactor: Database',
      createdAt: '2023-03-01T10:00:00Z',
      mergedAt: '2023-03-02T10:00:00Z',
      repository: {
        name: 'postgres',
        owner: { login: 'postgres' },
        stargazerCount: 12000,
      },
    },
    {
      id: 'pr_other_1',
      state: 'MERGED',
      title: 'Fix: Typo',
      repository: {
        name: 'other',
        owner: { login: 'random' },
        stargazerCount: 5,
      },
    },
  ],
  reviewsGiven: [
    {
      body: 'Great PR. We should check for reentrancy here though.',
      createdAt: '2023-05-01T10:00:00Z',
      pullRequest: {
        repository: {
          name: 'solana',
          owner: { login: 'solana-labs' },
          stargazerCount: 15000,
        },
      },
    },
    {
      body: 'Nit: naming could be better.',
      createdAt: '2023-06-01T10:00:00Z',
      pullRequest: {
        repository: {
          name: 'react',
          owner: { login: 'facebook' },
          stargazerCount: 200000,
        },
      },
    },
    {
      body: 'This bottleneck in the loop should be optimized. Maybe use memoization?',
      createdAt: '2023-07-01T10:00:00Z',
      pullRequest: {
        repository: {
          name: 'nest',
          owner: { login: 'nestjs' },
          stargazerCount: 60000,
        },
      },
    },
    {
      body: 'Check for overflow in this arithmetic operation.',
      createdAt: '2023-08-01T10:00:00Z',
      pullRequest: {
        repository: {
          name: 'go-ethereum',
          owner: { login: 'ethereum' },
          stargazerCount: 45000,
        },
      },
    },
    {
      body: 'Simple approval.',
      createdAt: '2023-09-01T10:00:00Z',
      pullRequest: {
        repository: {
          name: 'other',
          owner: { login: 'random' },
          stargazerCount: 10,
        },
      },
    },
  ],
  contributionCalendar: {
    totalContributions: 1500,
    weeks: Array.from({ length: 52 }, (_, i) => ({
      contributionDays: Array.from({ length: 7 }, (_, j) => ({
        contributionCount: Math.floor(Math.random() * 5),
        date: new Date(
          Date.now() -
            (52 - i) * 7 * 24 * 60 * 60 * 1000 +
            j * 24 * 60 * 60 * 1000,
        )
          .toISOString()
          .split('T')[0],
      })),
    })),
  },
};
