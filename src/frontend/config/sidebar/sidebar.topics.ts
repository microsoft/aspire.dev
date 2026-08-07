import type { StarlightSidebarTopicsUserConfig } from 'starlight-sidebar-topics';

import { referenceTopics } from './reference.topics.js';
import { communityTopics } from './community.topics.js';
import { dashboardTopics } from './dashboard.topics.js';
import { deploymentTopics } from './deployment.topics.js';
import { docsTopics } from './docs.topics.js';
import { integrationTopics } from './integrations.topics.js';

export const sidebarTopics: StarlightSidebarTopicsUserConfig = [
  docsTopics,
  integrationTopics,
  dashboardTopics,
  deploymentTopics,
  referenceTopics,
  communityTopics,
];
