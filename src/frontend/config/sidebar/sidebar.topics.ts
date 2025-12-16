import type { StarlightSidebarTopicsUserConfig } from 'starlight-sidebar-topics';

import { cliReferenceTopics } from './cli-reference.topics.js';
import { communityTopics } from './community.topics.js';
import { dashboardTopics } from './dashboard.topics.js';
import { deploymentTopics } from './deployment.topics.js';
import { diagnosticTopics } from './diagnostic.topics.js';
import { docsTopics } from './docs.topics.js';
import { integrationTopics } from './integrations.topics.js';

export const sidebarTopics: StarlightSidebarTopicsUserConfig = [
  docsTopics,
  integrationTopics,
  dashboardTopics,
  deploymentTopics,
  cliReferenceTopics,
  // {
  //     label: 'API Reference',
  //     id: 'reference-api',
  //     link: '/api',
  //     icon: 'document',
  //     items: [
  //         {
  //             label: 'API Reference',
  //             collapsed: false,
  //             autogenerate: { directory: '/reference/api', collapsed: true }
  //         },
  //     ]
  // },
  communityTopics,
  diagnosticTopics,
];
