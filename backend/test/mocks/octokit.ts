const createMockOctokit = () => ({
  rest: {
    users: {
      getByUsername: jest.fn(),
      listOrgsForUser: jest.fn(),
    },
    repos: {
      listForUser: jest.fn(),
      listForOrg: jest.fn(),
      getContent: jest.fn(),
    },
    search: {
      issuesAndPullRequests: jest.fn(),
    },
  },
  request: jest.fn(),
  graphql: jest.fn(),
});

export const Octokit = jest.fn().mockImplementation(createMockOctokit);
export const App = jest.fn();
export const OAuthApp = jest.fn();
export const RequestError = Error;
export const createNodeMiddleware = jest.fn();
