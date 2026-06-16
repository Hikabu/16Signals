import { GithubEventsData } from '../types';

export const GITHUB_EVENTS_FIXTURE: GithubEventsData = {
  events: [
    // 10 PushEvents (3 on private org repos)
    ...Array.from({ length: 7 }, (_, i) => ({
      id: `push-${i}`,
      type: 'PushEvent',
      repo: { name: `org/repo-${i}` },
      actor: { login: 'testuser' },
      public: true,
      created_at: new Date().toISOString(),
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      id: `push-private-${i}`,
      type: 'PushEvent',
      repo: { name: `secret-org/private-repo-${i}` },
      actor: { login: 'testuser' },
      public: false,
      created_at: new Date().toISOString(),
    })),
    // 5 PullRequestEvents
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `pr-event-${i}`,
      type: 'PullRequestEvent',
      repo: { name: `org/repo-${i}` },
      actor: { login: 'testuser' },
      payload: { action: 'opened' },
      created_at: new Date().toISOString(),
    })),
  ],
};
