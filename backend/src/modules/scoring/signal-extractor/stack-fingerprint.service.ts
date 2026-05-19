import { Injectable } from '@nestjs/common';
import { ManifestResult } from '../github-adapter/github-data.types';

export interface StackFingerprint {
  languages: string[];
  tools: string[];
}

export const TOOL_DETECTION_MAP: Record<string, string> = {
  '@coral-xyz/anchor': 'Anchor',
  'anchor-lang': 'Anchor',
  '@project-serum/anchor': 'Anchor',
  '@solana/web3.js': 'Solana web3.js',
  '@solana/spl-token': 'Solana SPL Token',
  '@solana/wallet-adapter-react': 'Solana Wallet Adapter',
  bullmq: 'BullMQ',
  bull: 'BullMQ',
  kafkajs: 'Kafka',
  'kafka-node': 'Kafka',
  amqplib: 'RabbitMQ',
  '@nestjs/bullmq': 'BullMQ',
  'aws-sdk': 'AWS',
  '@aws-sdk/*': 'AWS',
  '@clickhouse/client': 'ClickHouse',
  clickhouse: 'ClickHouse',
  '@graphprotocol/graph-ts': 'The Graph',
  hardhat: 'Hardhat',
  '@nomicfoundation/hardhat-toolbox': 'Hardhat',
  '@nomiclabs/hardhat-ethers': 'Hardhat',
  'forge-std': 'Foundry',
  viem: 'Viem',
  wagmi: 'Wagmi',
  ethers: 'Ethers',
  web3: 'Web3.js',
  prisma: 'Prisma',
  '@prisma/client': 'Prisma',
  typeorm: 'TypeORM',
  sequelize: 'Sequelize',
  redis: 'Redis',
  ioredis: 'Redis',
  pg: 'PostgreSQL',
  postgres: 'PostgreSQL',
  mongoose: 'MongoDB',
  mongodb: 'MongoDB',
  mysql2: 'MySQL',
  mysql: 'MySQL',
  sqlite3: 'SQLite',
  'better-sqlite3': 'SQLite',
  express: 'Express',
  fastify: 'Fastify',
  '@nestjs/core': 'NestJS',
  next: 'Next.js',
  react: 'React',
  vue: 'Vue',
  svelte: 'Svelte',
  tailwindcss: 'Tailwind CSS',
  '@tanstack/react-query': 'TanStack Query',
  graphql: 'GraphQL',
  '@apollo/client': 'Apollo',
  'apollo-server': 'Apollo',
  jest: 'Jest',
  vitest: 'Vitest',
  playwright: 'Playwright',
  cypress: 'Cypress',
  dockerode: 'Docker',
  '@pulumi/pulumi': 'Pulumi',
  tokio: 'Tokio',
  axum: 'Axum',
  actix: 'Actix',
  rocket: 'Rocket',
  diesel: 'Diesel',
  sqlx: 'SQLx',
  serde: 'Serde',
  clap: 'Clap',
};

@Injectable()
export class StackFingerprintService {
  detectTools(manifests: ManifestResult[] | undefined | null): string[] {
    const tools = new Set<string>();

    if (!manifests) {
      return [];
    }

    for (const key of manifests.flatMap((manifest) => manifest.deps)) {
      const toolName = this.detectToolForDependency(key);
      if (toolName) tools.add(toolName);
    }

    return Array.from(tools).sort((a, b) => a.localeCompare(b));
  }

  extract(
    manifests: ManifestResult[] | undefined | null,
    languages: string[],
  ): StackFingerprint {
    return {
      languages,
      tools: this.detectTools(manifests),
    };
  }

  private detectToolForDependency(dependency: string): string | undefined {
    const exactMatch = TOOL_DETECTION_MAP[dependency];
    if (exactMatch) return exactMatch;

    for (const [pattern, toolName] of Object.entries(TOOL_DETECTION_MAP)) {
      if (
        pattern.endsWith('*') &&
        dependency.startsWith(pattern.slice(0, -1))
      ) {
        return toolName;
      }
    }

    return undefined;
  }
}
