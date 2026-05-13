import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Matches versioned "What's new" release notes filenames such as
// `aspire-13.mdx` (13.0), `aspire-13-3.mdx` (13.3), and `aspire-9-5.mdx` (9.5).
// Excludes `upgrade-aspire.mdx` and other non-versioned pages.
const whatsNewVersionPattern = /^aspire-(\d+)(?:-(\d+))?\.mdx$/;

function getLatestWhatsNewSlug() {
  const whatsNewDir = fileURLToPath(
    new URL('../src/content/docs/whats-new/', import.meta.url)
  );

  let bestSlug = null;
  let bestKey = -1;

  for (const entry of readdirSync(whatsNewDir)) {
    const match = whatsNewVersionPattern.exec(entry);
    if (!match) continue;

    const major = Number(match[1]);
    const minor = Number(match[2] ?? 0);
    const key = major * 1000 + minor;

    if (key > bestKey) {
      bestKey = key;
      bestSlug = entry.replace(/\.mdx$/, '');
    }
  }

  if (!bestSlug) {
    throw new Error(
      `No versioned "What's new" entries matched ${whatsNewVersionPattern} in ${whatsNewDir}. ` +
        `The /whats-new/ redirect cannot be computed; check the file naming convention.`
    );
  }

  return bestSlug;
}

const latestWhatsNewSlug = getLatestWhatsNewSlug();

export const redirects = {
  // https://docs.astro.build/en/guides/routing/#configured-redirects
  // For example:
  // '/original/path/': '/new/path'
  '/cli/': '/reference/cli/overview/',
  '/deployment/overview/': '/deployment/deploy-with-aspire/',
  '/compatibility/': '/whats-new/upgrade-aspire/',
  // `/whats-new/` has no index page; redirect it to the latest release notes
  // (computed from the filenames in src/content/docs/whats-new/). Uses 302
  // because the destination changes when a new version ships.
  '/whats-new/': {
    status: 302,
    destination: `/whats-new/${latestWhatsNewSlug}/`,
  },
  '/configure-the-mcp-server/': '/get-started/aspire-mcp-server/',
  '/install-aspire-cli/': '/get-started/install-cli/',
  '/get-started/welcome/': '/docs/',
  '/get-started/installation/': '/get-started/install-cli/',
  // Integration -client → -connect rename
  '/integrations/ai/github-models/github-models-client/': '/integrations/ai/github-models/github-models-connect/',
  '/integrations/ai/ollama/ollama-client/': '/integrations/ai/ollama/ollama-connect/',
  '/integrations/ai/openai/openai-client/': '/integrations/ai/openai/openai-connect/',
  '/integrations/caching/garnet/garnet-client/': '/integrations/caching/garnet/garnet-connect/',
  '/integrations/caching/redis-distributed/redis-distributed-client/': '/integrations/caching/redis-distributed/redis-distributed-connect/',
  '/integrations/caching/redis-output/redis-output-client/': '/integrations/caching/redis-output/redis-output-connect/',
  '/integrations/caching/redis/redis-client/': '/integrations/caching/redis/redis-connect/',
  '/integrations/cloud/azure/azure-ai-foundry/azure-ai-foundry-client/': '/integrations/cloud/azure/azure-ai-foundry/azure-ai-foundry-connect/',
  '/integrations/cloud/azure/azure-ai-inference/azure-ai-inference-client/': '/integrations/cloud/azure/azure-ai-inference/azure-ai-inference-connect/',
  '/integrations/cloud/azure/azure-ai-search/azure-ai-search-client/': '/integrations/cloud/azure/azure-ai-search/azure-ai-search-connect/',
  '/integrations/cloud/azure/azure-app-configuration/azure-app-configuration-client/': '/integrations/cloud/azure/azure-app-configuration/azure-app-configuration-connect/',
  '/integrations/cloud/azure/azure-app-service/azure-app-service-client/': '/integrations/cloud/azure/azure-app-service/azure-app-service-connect/',
  '/integrations/cloud/azure/azure-cache-redis/azure-cache-redis-client/': '/integrations/cloud/azure/azure-cache-redis/azure-cache-redis-connect/',
  '/integrations/cloud/azure/azure-container-registry/azure-container-registry-client/': '/integrations/cloud/azure/azure-container-registry/azure-container-registry-connect/',
  '/integrations/cloud/azure/azure-cosmos-db/azure-cosmos-db-client/': '/integrations/cloud/azure/azure-cosmos-db/azure-cosmos-db-connect/',
  '/integrations/cloud/azure/azure-event-hubs/azure-event-hubs-client/': '/integrations/cloud/azure/azure-event-hubs/azure-event-hubs-connect/',
  '/integrations/cloud/azure/azure-functions/azure-functions-client/': '/integrations/cloud/azure/azure-functions/azure-functions-connect/',
  '/integrations/cloud/azure/azure-key-vault/azure-key-vault-client/': '/integrations/cloud/azure/azure-key-vault/azure-key-vault-connect/',
  '/integrations/cloud/azure/azure-openai/azure-openai-client/': '/integrations/cloud/azure/azure-openai/azure-openai-connect/',
  '/integrations/cloud/azure/azure-postgresql/azure-postgresql-client/': '/integrations/cloud/azure/azure-postgresql/azure-postgresql-connect/',
  '/integrations/cloud/azure/azure-service-bus/azure-service-bus-client/': '/integrations/cloud/azure/azure-service-bus/azure-service-bus-connect/',
  '/integrations/cloud/azure/azure-signalr/azure-signalr-client/': '/integrations/cloud/azure/azure-signalr/azure-signalr-connect/',
  '/integrations/cloud/azure/azure-sql-database/azure-sql-database-client/': '/integrations/cloud/azure/azure-sql-database/azure-sql-database-connect/',
  '/integrations/cloud/azure/azure-storage-blobs/azure-storage-blobs-client/': '/integrations/cloud/azure/azure-storage-blobs/azure-storage-blobs-connect/',
  '/integrations/cloud/azure/azure-storage-queues/azure-storage-queues-client/': '/integrations/cloud/azure/azure-storage-queues/azure-storage-queues-connect/',
  '/integrations/cloud/azure/azure-storage-tables/azure-storage-tables-client/': '/integrations/cloud/azure/azure-storage-tables/azure-storage-tables-connect/',
  '/integrations/cloud/azure/azure-web-pubsub/azure-web-pubsub-client/': '/integrations/cloud/azure/azure-web-pubsub/azure-web-pubsub-connect/',
  '/integrations/databases/clickhouse/clickhouse-client/': '/integrations/databases/clickhouse/clickhouse-connect/',
  '/integrations/databases/efcore/azure-cosmos-db/azure-cosmos-db-client/': '/integrations/databases/efcore/azure-cosmos-db/azure-cosmos-db-connect/',
  '/integrations/databases/efcore/azure-postgresql/azure-postgresql-client/': '/integrations/databases/efcore/azure-postgresql/azure-postgresql-connect/',
  '/integrations/databases/efcore/azure-sql/azure-sql-client/': '/integrations/databases/efcore/azure-sql/azure-sql-connect/',
  '/integrations/databases/efcore/mongodb/mongodb-efcore-client/': '/integrations/databases/efcore/mongodb/mongodb-efcore-connect/',
  '/integrations/databases/efcore/mysql/mysql-client/': '/integrations/databases/efcore/mysql/mysql-connect/',
  '/integrations/databases/efcore/oracle/oracle-client/': '/integrations/databases/efcore/oracle/oracle-connect/',
  '/integrations/databases/efcore/postgres/postgresql-client/': '/integrations/databases/efcore/postgres/postgresql-connect/',
  '/integrations/databases/efcore/sql-server/sql-server-client/': '/integrations/databases/efcore/sql-server/sql-server-connect/',
  '/integrations/databases/elasticsearch/elasticsearch-client/': '/integrations/databases/elasticsearch/elasticsearch-connect/',
  '/integrations/databases/kurrentdb/kurrentdb-client/': '/integrations/databases/kurrentdb/kurrentdb-connect/',
  '/integrations/databases/meilisearch/meilisearch-client/': '/integrations/databases/meilisearch/meilisearch-connect/',
  '/integrations/databases/milvus/milvus-client/': '/integrations/databases/milvus/milvus-connect/',
  '/integrations/databases/mongodb/mongodb-client/': '/integrations/databases/mongodb/mongodb-connect/',
  '/integrations/databases/mysql/mysql-client/': '/integrations/databases/mysql/mysql-connect/',
  '/integrations/databases/qdrant/qdrant-client/': '/integrations/databases/qdrant/qdrant-connect/',
  '/integrations/databases/ravendb/ravendb-client/': '/integrations/databases/ravendb/ravendb-connect/',
  '/integrations/databases/sql-server/sql-server-client/': '/integrations/databases/sql-server/sql-server-connect/',
  '/integrations/databases/sqlite/sqlite-client/': '/integrations/databases/sqlite/sqlite-connect/',
  '/integrations/databases/surrealdb/surrealdb-client/': '/integrations/databases/surrealdb/surrealdb-connect/',
  '/integrations/devtools/flagd/flagd-client/': '/integrations/devtools/flagd/flagd-connect/',
  '/integrations/devtools/goff/goff-client/': '/integrations/devtools/goff/goff-connect/',
  '/integrations/devtools/mailpit/mailpit-client/': '/integrations/devtools/mailpit/mailpit-connect/',
  '/integrations/messaging/apache-kafka/apache-kafka-client/': '/integrations/messaging/apache-kafka/apache-kafka-connect/',
  '/integrations/messaging/nats/nats-client/': '/integrations/messaging/nats/nats-connect/',
  '/integrations/messaging/rabbitmq/rabbitmq-client/': '/integrations/messaging/rabbitmq/rabbitmq-connect/',
  '/integrations/observability/seq/seq-client/': '/integrations/observability/seq/seq-connect/',
  '/integrations/postgres/': '/integrations/databases/postgres/postgres-get-started/',
  '/integrations/databases/postgres/': '/integrations/databases/postgres/postgres-get-started/',
  '/integrations/databases/sql-server/': '/integrations/databases/sql-server/sql-server-get-started/',
  '/integrations/databases/milvus/': '/integrations/databases/milvus/milvus-get-started/',
  '/integrations/databases/qdrant/': '/integrations/databases/qdrant/qdrant-get-started/',
  '/integrations/oracle/': '/integrations/databases/efcore/oracle/oracle-get-started/',
  '/integrations/databases/oracle/': '/integrations/databases/efcore/oracle/oracle-get-started/',
  '/integrations/sqlite/': '/integrations/databases/sqlite/sqlite-get-started/',
  '/integrations/sql-server/': '/integrations/databases/sql-server/sql-server-get-started/',
  '/integrations/mysql/': '/integrations/databases/mysql/mysql-get-started/',
  '/integrations/databases/mysql/': '/integrations/databases/mysql/mysql-get-started/',
  '/integrations/rabbitmq/': '/integrations/messaging/rabbitmq/rabbitmq-get-started/',
  '/integrations/eventstore/': '/integrations/databases/kurrentdb/kurrentdb-get-started/',
  '/integrations/databases/efcore/mssql/': '/integrations/databases/efcore/mysql/mysql-get-started/',
  '/integrations/databases/mongodb/': '/integrations/databases/mongodb/mongodb-get-started/',
  '/integrations/databases/mongodb-extensions/': '/integrations/databases/mongodb/mongodb-extensions/',
  '/integrations/databases/efcore/azure-cosmos-db/': '/integrations/databases/efcore/azure-cosmos-db/azure-cosmos-db-get-started/',
  '/integrations/databases/oracle-ef/': '/integrations/databases/efcore/oracle/oracle-get-started/',
  '/integrations/databases/elasticsearch/': '/integrations/databases/elasticsearch/elasticsearch-get-started/',
  '/integrations/cloud/azure/azure-postgresql/': '/integrations/cloud/azure/azure-postgresql/azure-postgresql-get-started/',
  '/integrations/databases/efcore/sql-server/': '/integrations/databases/efcore/sql-server/sql-server-get-started/',
  '/integrations/databases/efcore/postgresql/': '/integrations/databases/efcore/postgres/postgresql-get-started/',
  '/integrations/databases/efcore/azure-postgresql/': '/integrations/databases/efcore/azure-postgresql/azure-postgresql-get-started/',
  '/integrations/databases/efcore/azure-sql/': '/integrations/databases/efcore/azure-sql/azure-sql-get-started/',
  '/integrations/ai/github-models/': '/integrations/ai/github-models/github-models-get-started/',
  '/integrations/ai/openai/': '/integrations/ai/openai/openai-get-started/',
  '/integrations/caching/redis/': '/integrations/caching/redis/redis-get-started/',
  '/integrations/caching/redis-distributed/': '/integrations/caching/redis-distributed/redis-distributed-get-started/',
  '/integrations/caching/redis-output/': '/integrations/caching/redis-output/redis-output-get-started/',
  '/integrations/caching/valkey/': '/integrations/caching/valkey/valkey-get-started/',
  '/integrations/caching/garnet/': '/integrations/caching/garnet/garnet-get-started/',
  '/integrations/messaging/apache-kafka/': '/integrations/messaging/apache-kafka/apache-kafka-get-started/',
  '/integrations/messaging/rabbitmq/': '/integrations/messaging/rabbitmq/rabbitmq-get-started/',
  '/integrations/messaging/nats/': '/integrations/messaging/nats/nats-get-started/',
  '/integrations/observability/seq/': '/integrations/observability/seq/seq-get-started/',
  '/integrations/cloud/azure/azure-ai-foundry/': '/integrations/cloud/azure/azure-ai-foundry/azure-ai-foundry-get-started/',
  '/integrations/cloud/azure/azure-ai-inference/': '/integrations/cloud/azure/azure-ai-inference/azure-ai-inference-get-started/',
  '/integrations/cloud/azure/azure-ai-search/': '/integrations/cloud/azure/azure-ai-search/azure-ai-search-get-started/',
  '/integrations/cloud/azure/azure-app-configuration/': '/integrations/cloud/azure/azure-app-configuration/azure-app-configuration-get-started/',
  '/integrations/cloud/azure/azure-app-service/': '/integrations/cloud/azure/azure-app-service/azure-app-service-get-started/',
  '/integrations/cloud/azure/azure-cache-redis/': '/integrations/cloud/azure/azure-cache-redis/azure-cache-redis-get-started/',
  '/integrations/cloud/azure/azure-container-registry/': '/integrations/cloud/azure/azure-container-registry/azure-container-registry-get-started/',
  '/integrations/cloud/azure/azure-cosmos-db/': '/integrations/cloud/azure/azure-cosmos-db/azure-cosmos-db-get-started/',
  '/integrations/cloud/azure/azure-event-hubs/': '/integrations/cloud/azure/azure-event-hubs/azure-event-hubs-get-started/',
  '/integrations/cloud/azure/azure-functions/': '/integrations/cloud/azure/azure-functions/azure-functions-get-started/',
  '/integrations/cloud/azure/azure-key-vault/': '/integrations/cloud/azure/azure-key-vault/azure-key-vault-get-started/',
  '/integrations/cloud/azure/azure-openai/': '/integrations/cloud/azure/azure-openai/azure-openai-get-started/',
  '/integrations/cloud/azure/azure-service-bus/': '/integrations/cloud/azure/azure-service-bus/azure-service-bus-get-started/',
  '/integrations/cloud/azure/azure-signalr/': '/integrations/cloud/azure/azure-signalr/azure-signalr-get-started/',
  '/integrations/cloud/azure/azure-sql-database/': '/integrations/cloud/azure/azure-sql-database/azure-sql-database-get-started/',
  '/integrations/cloud/azure/azure-storage-blobs/': '/integrations/cloud/azure/azure-storage-blobs/azure-storage-blobs-get-started/',
  '/integrations/cloud/azure/azure-storage-queues/': '/integrations/cloud/azure/azure-storage-queues/azure-storage-queues-get-started/',
  '/integrations/cloud/azure/azure-storage-tables/': '/integrations/cloud/azure/azure-storage-tables/azure-storage-tables-get-started/',
  '/integrations/cloud/azure/azure-web-pubsub/': '/integrations/cloud/azure/azure-web-pubsub/azure-web-pubsub-get-started/',
  '/integrations/ai/ollama/': '/integrations/ai/ollama/ollama-get-started/',
  '/integrations/databases/kurrentdb/': '/integrations/databases/kurrentdb/kurrentdb-get-started/',
  '/integrations/databases/meilisearch/': '/integrations/databases/meilisearch/meilisearch-get-started/',
  '/integrations/databases/ravendb/': '/integrations/databases/ravendb/ravendb-get-started/',
  '/integrations/databases/surrealdb/': '/integrations/databases/surrealdb/surrealdb-get-started/',
  '/integrations/devtools/flagd/': '/integrations/devtools/flagd/flagd-get-started/',
  '/integrations/devtools/goff/': '/integrations/devtools/goff/goff-get-started/',
  '/integrations/devtools/mailpit/': '/integrations/devtools/mailpit/mailpit-get-started/',
  '/integrations/frameworks/csharp-file-based-apps/': '/integrations/dotnet/csharp-file-based-apps/',
  '/integrations/frameworks/maui/': '/integrations/dotnet/maui/',
  '/fundamentals/service-defaults/': '/get-started/csharp-service-defaults/',
  '/fundamentals/launch-profiles/': '/integrations/dotnet/launch-profiles/',
  '/ja/fundamentals/service-defaults/': '/ja/get-started/csharp-service-defaults/',
  '/ja/fundamentals/launch-profiles/': '/ja/integrations/dotnet/launch-profiles/',
  '/app-host/dotnet-tool-resources/': '/integrations/dotnet/dotnet-tool-resources/',
  '/reference/cli/commands/aspire-mcp-init/': '/reference/cli/commands/aspire-agent-init/',
  '/reference/cli/commands/aspire-mcp-start/': '/reference/cli/commands/aspire-agent-mcp/',
  '/reference/cli/commands/aspire-exec/': '/reference/cli/commands/aspire-resource/',
  '/reference/cli/install/': '/get-started/install-cli/',
  '/get-started/configure-mcp/': '/get-started/ai-coding-agents/',
  '/get-started/first-app-csharp-apphost/': '/get-started/first-app/',
  '/get-started/first-app-typescript-apphost/': '/get-started/first-app/',
  '/get-started/deploy-first-app-csharp/': '/get-started/deploy-first-app/',
  '/get-started/deploy-first-app-typescript/': '/get-started/deploy-first-app/',
  '/get-started/add-aspire-existing-app-csharp-apphost/': '/get-started/add-aspire-existing-app/',
  '/get-started/add-aspire-existing-app-typescript-apphost/': '/get-started/add-aspire-existing-app/',
  '/ja/get-started/first-app-csharp-apphost/': '/ja/get-started/first-app/',
  '/ja/get-started/first-app-typescript-apphost/': '/ja/get-started/first-app/',
  '/ja/get-started/deploy-first-app-csharp/': '/ja/get-started/deploy-first-app/',
  '/ja/get-started/deploy-first-app-typescript/': '/ja/get-started/deploy-first-app/',
  '/ja/get-started/add-aspire-existing-app-csharp-apphost/': '/ja/get-started/add-aspire-existing-app/',
  '/ja/get-started/add-aspire-existing-app-typescript-apphost/': '/ja/get-started/add-aspire-existing-app/',
  '/get-started/pipelines/': '/deployment/pipelines/',
  '/ja/get-started/pipelines/': '/ja/deployment/pipelines/',
  '/deployment/manifest-format/': '/deployment/azure/manifest-format/',
  '/deployment/azure/aca-deployment-aspire-cli/': '/deployment/azure/container-apps/',
  '/deployment/azure/customize-container-apps/': '/deployment/azure/container-apps/',
  '/fundamentals/app-lifecycle/': '/deployment/app-lifecycle/',
  '/dashboard/copilot/': '/dashboard/ai-coding-agents/',
  '/dashboard/mcp-server/': '/get-started/aspire-mcp-server/',
};
