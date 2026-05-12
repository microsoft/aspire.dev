import type { StarlightSidebarTopicsUserConfig } from 'starlight-sidebar-topics';

export const integrationTopics: StarlightSidebarTopicsUserConfig = {
  label: {
    en: 'Integrations',
    es: 'Integraciones',
    fr: 'Intégrations',
    de: 'Integrationen',
    it: 'Integrazioni',
    ru: 'Интеграции',
    'zh-CN': '集成',
    da: 'Integrationer',
    hi: 'इंटीग्रेशन',
    id: 'Integrasi',
    ja: 'インテグレーション',
    ko: '통합',
    'pt-BR': 'Integrações',
    tr: 'Entegrasyonlar',
    uk: 'Інтеграції',
  },
  link: '/integrations/',
  icon: 'puzzle',
  items: [
    {
      label: 'Aspire integrations',
      translations: {
        da: 'Aspire-integrationer',
        de: 'Aspire-Integrationen',
        en: 'Aspire integrations',
        es: 'Integraciones de Aspire',
        fr: 'Intégrations Aspire',
        hi: 'Aspire इंटीग्रेशन',
        id: 'Integrasi Aspire',
        it: 'Integrazioni di Aspire',
        ja: 'Aspireの統合',
        ko: 'Aspire 통합',
        'pt-BR': 'Integrações Aspire',
        ru: 'Интеграции Aspire',
        tr: 'Aspire entegrasyonları',
        uk: 'Інтеграції Aspire',
        'zh-CN': 'Aspire 集成',
      },
      items: [
        {
          label: 'Overview',
          translations: {
            da: 'Oversigt',
            de: 'Übersicht',
            en: 'Overview',
            es: 'Resumen',
            fr: 'Aperçu',
            hi: 'अवलोकन',
            id: 'Ikhtisar',
            it: 'Panoramica',
            ja: '概要',
            ko: '개요',
            'pt-BR': 'Visão geral',
            ru: 'Обзор',
            tr: 'Genel bakış',
            uk: 'Огляд',
            'zh-CN': '概述',
          },
          slug: 'integrations',
        },
        {
          label: 'What are Aspire integrations?',
          translations: {
            da: 'Hvad er Aspire-integrationer?',
            de: 'Was sind Aspire-Integrationen?',
            en: 'What are Aspire integrations?',
            es: '¿Qué son las integraciones de Aspire?',
            fr: 'Quelles sont les intégrations Aspire ?',
            hi: 'Aspire इंटीग्रेशन क्या हैं?',
            id: 'Apa itu integrasi Aspire?',
            it: 'Cosa sono le integrazioni di Aspire?',
            ja: 'Aspireの統合とは何ですか？',
            ko: 'Aspire 통합이란 무엇입니까?',
            'pt-BR': 'O que são integrações Aspire?',
            ru: 'Что такое интеграции Aspire?',
            tr: 'Aspire entegrasyonları nedir?',
            uk: 'Що таке інтеграції Aspire?',
            'zh-CN': 'Aspire 集成是什么？',
          },
          slug: 'integrations/overview',
        },
        {
          label: 'Explore integration gallery',
          translations: {
            da: 'Udforsk integrationsgalleri',
            de: 'Integrationsgalerie erkunden',
            en: 'Explore integration gallery',
            es: 'Explorar galería de integraciones',
            fr: "Explorer la galerie d'intégrations",
            hi: 'इंटीग्रेशन गैलरी का अन्वेषण करें',
            id: 'Jelajahi galeri integrasi',
            it: 'Esplora la galleria delle integrazioni',
            ja: 'インテグレーションギャラリーを探索',
            ko: '통합 갤러리 탐색',
            'pt-BR': 'Explorar galeria de integrações',
            ru: 'Исследовать галерею интеграций',
            tr: 'Entegrasyon galerisini keşfet',
            uk: 'Дослідити галерею інтеграцій',
            'zh-CN': '探索集成图库',
          },
          slug: 'integrations/gallery',
        },
      ],
    },
    {
      label: 'Artificial Intelligence (AI)',
      collapsed: true,
      translations: {
        da: 'Kunstig intelligens (AI)',
        de: 'Künstliche Intelligenz (KI)',
        en: 'Artificial Intelligence (AI)',
        es: 'Inteligencia Artificial (IA)',
        fr: 'Intelligence Artificielle (IA)',
        hi: 'कृत्रिम बुद्धिमत्ता (एआई)',
        id: 'Kecerdasan Buatan (AI)',
        it: 'Intelligenza Artificiale (IA)',
        ja: '人工知能 (AI)',
        ko: '인공지능 (AI)',
        'pt-BR': 'Inteligência Artificial (IA)',
        ru: 'Искусственный интеллект (ИИ)',
        tr: 'Yapay Zeka (YZ)',
        uk: 'Штучний інтелект (ШІ)',
        'zh-CN': '人工智能 (AI)',
      },
      items: [
        {
          label: 'GitHub Models',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/ai/github-models/github-models-get-started',
            },
            {
              label: 'Set up GitHub Models in the AppHost',
              slug: 'integrations/ai/github-models/github-models-host',
            },
            {
              label: 'Connect to GitHub Models',
              slug: 'integrations/ai/github-models/github-models-connect',
            },
          ],
        },
        {
          label: 'Ollama',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/ai/ollama/ollama-get-started',
            },
            {
              label: 'Set up Ollama in the AppHost',
              slug: 'integrations/ai/ollama/ollama-host',
            },
            {
              label: 'Connect to Ollama',
              slug: 'integrations/ai/ollama/ollama-connect',
            },
          ],
        },
        {
          label: 'OpenAI',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/ai/openai/openai-get-started',
            },
            {
              label: 'Set up OpenAI in the AppHost',
              slug: 'integrations/ai/openai/openai-host',
            },
            {
              label: 'Connect to OpenAI',
              slug: 'integrations/ai/openai/openai-connect',
            },
          ],
        },
      ],
    },
    {
      label: 'Custom integrations',
      collapsed: true,
      translations: {
        da: 'Brugerdefinerede integrationer',
        de: 'Benutzerdefinierte Integrationen',
        en: 'Custom integrations',
        es: 'Integraciones personalizadas',
        fr: 'Intégrations personnalisées',
        hi: 'कस्टम इंटीग्रेशन',
        id: 'Integrasi kustom',
        it: 'Integrazioni personalizzate',
        ja: 'カスタムインテグレーション',
        ko: '맞춤형 통합',
        'pt-BR': 'Integrações personalizadas',
        ru: 'Пользовательские интеграции',
        tr: 'Özel entegrasyonlar',
        uk: 'Користувацькі інтеграції',
        'zh-CN': '自定义集成',
      },
      items: [
        {
          label: 'Custom hosting',
          slug: 'integrations/custom-integrations/hosting-integrations',
          translations: {
            da: 'Brugerdefineret hosting',
            de: 'Benutzerdefiniertes Hosting',
            en: 'Custom hosting',
            es: 'Alojamiento personalizado',
            fr: 'Hébergement personnalisé',
            hi: 'कस्टम होस्टिंग',
            id: 'Hosting kustom',
            it: 'Hosting personalizzato',
            ja: 'カスタムホスティング',
            ko: '맞춤형 호스팅',
            'pt-BR': 'Hospedagem personalizada',
            ru: 'Пользовательский хостинг',
            tr: 'Özel barındırma',
            uk: 'Користувацький хостинг',
            'zh-CN': '自定义托管',
          },
        },
        {
          label: 'Custom clients',
          slug: 'integrations/custom-integrations/client-integrations',
          translations: {
            da: 'Brugerdefinerede klienter',
            de: 'Benutzerdefinierte Clients',
            en: 'Custom clients',
            es: 'Clientes personalizados',
            fr: 'Clients personnalisés',
            hi: 'कस्टम क्लाइंट',
            id: 'Klien kustom',
            it: 'Client personalizzati',
            ja: 'カスタムクライアント',
            ko: '맞춤형 클라이언트',
            'pt-BR': 'Clientes personalizados',
            ru: 'Пользовательские клиенты',
            tr: 'Özel istemciler',
            uk: 'Користувацькі клієнти',
            'zh-CN': '自定义客户端',
          },
        },
        {
          label: 'Secure communications',
          slug: 'integrations/custom-integrations/secure-communication',
          translations: {
            da: 'Sikre kommunikationer',
            de: 'Sichere Kommunikation',
            en: 'Secure communications',
            es: 'Comunicaciones seguras',
            fr: 'Communications sécurisées',
            hi: 'सुरक्षित संचार',
            id: 'Komunikasi aman',
            it: 'Comunicazioni sicure',
            ja: '安全な通信',
            ko: '보안 통신',
            'pt-BR': 'Comunicações seguras',
            ru: 'Безопасные коммуникации',
            tr: 'Güvenli iletişim',
            uk: 'Безпечні комунікації',
            'zh-CN': '安全通信',
          },
        },
      ],
    },
    {
      label: 'Cloud providers',
      collapsed: true,
      translations: {
        da: 'Cloud-udbydere',
        de: 'Cloud-Anbieter',
        en: 'Cloud providers',
        es: 'Proveedores de la nube',
        fr: 'Fournisseurs de cloud',
        hi: 'क्लाउड प्रदाता',
        id: 'Penyedia Cloud',
        it: 'Provider Cloud',
        ja: 'クラウドプロバイダー',
        ko: '클라우드 제공업체',
        'pt-BR': 'Provedores de Nuvem',
        ru: 'Облачные провайдеры',
        tr: 'Bulut Sağlayıcıları',
        uk: 'Хмарні провайдери',
        'zh-CN': '云提供商',
      },
      items: [
        {
          label: 'AWS',
          link: 'https://docs.aws.amazon.com/sdk-for-net/v4/developer-guide/aspire-integrations.html',
        },
        {
          label: 'Azure',
          collapsed: true,
          items: [
            { label: 'Overview', slug: 'integrations/cloud/azure/overview' },
            {
              label: 'Customize Azure resources',
              slug: 'integrations/cloud/azure/customize-resources',
            },
            {
              label: 'Local Azure provisioning',
              slug: 'integrations/cloud/azure/local-provisioning',
            },
            {
              label: 'Configure Azure Container Apps',
              slug: 'integrations/cloud/azure/configure-container-apps',
            },
            {
              label: 'Default Azure credential',
              slug: 'integrations/cloud/azure/azure-default-credential',
            },
            {
              label: 'Azure AI',
              collapsed: true,
              items: [
                {
                  label: 'AI compatibility matrix',
                  slug: 'integrations/cloud/azure/ai-compatibility-matrix',
                },
                {
                  label: 'Microsoft Foundry',
                  collapsed: true,
                  items: [
                    {
                      label: 'Get started',
                      slug: 'integrations/cloud/azure/azure-ai-foundry/azure-ai-foundry-get-started',
                    },
                    {
                      label: 'Set up Azure in the AppHost',
                      slug: 'integrations/cloud/azure/azure-ai-foundry/azure-ai-foundry-host',
                    },
                    {
                      label: 'Client integration',
                      slug: 'integrations/cloud/azure/azure-ai-foundry/azure-ai-foundry-connect',
                    },
                  ],
                },
                {
                  label: 'Azure AI Inference',
                  collapsed: true,
                  items: [
                    {
                      label: 'Get started',
                      slug: 'integrations/cloud/azure/azure-ai-inference/azure-ai-inference-get-started',
                    },
                    {
                      label: 'Set up Azure AI Inference in the AppHost',
                      slug: 'integrations/cloud/azure/azure-ai-inference/azure-ai-inference-host',
                    },
                    {
                      label: 'Client integration',
                      slug: 'integrations/cloud/azure/azure-ai-inference/azure-ai-inference-connect',
                    },
                  ],
                },
                {
                  label: 'Azure AI Search',
                  collapsed: true,
                  items: [
                    {
                      label: 'Get started',
                      slug: 'integrations/cloud/azure/azure-ai-search/azure-ai-search-get-started',
                    },
                    {
                      label: 'Set up Azure AI Search in the AppHost',
                      slug: 'integrations/cloud/azure/azure-ai-search/azure-ai-search-host',
                    },
                    {
                      label: 'Client integration',
                      slug: 'integrations/cloud/azure/azure-ai-search/azure-ai-search-connect',
                    },
                  ],
                },
                {
                  label: 'Azure OpenAI',
                  collapsed: true,
                  items: [
                    {
                      label: 'Get started',
                      slug: 'integrations/cloud/azure/azure-openai/azure-openai-get-started',
                    },
                    {
                      label: 'Set up Azure OpenAI in the AppHost',
                      slug: 'integrations/cloud/azure/azure-openai/azure-openai-host',
                    },
                    {
                      label: 'Client integration',
                      slug: 'integrations/cloud/azure/azure-openai/azure-openai-connect',
                    },
                  ],
                },
              ],
            },
            {
              label: 'Azure App Configuration',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  slug: 'integrations/cloud/azure/azure-app-configuration/azure-app-configuration-get-started',
                },
                {
                  label: 'Set up Azure App Configuration in the AppHost',
                  slug: 'integrations/cloud/azure/azure-app-configuration/azure-app-configuration-host',
                },
                {
                  label: 'Client integration',
                  slug: 'integrations/cloud/azure/azure-app-configuration/azure-app-configuration-connect',
                },
              ],
            },
            {
              label: 'Azure App Service',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  slug: 'integrations/cloud/azure/azure-app-service/azure-app-service-get-started',
                },
                {
                  label: 'Set up Azure App Service in the AppHost',
                  slug: 'integrations/cloud/azure/azure-app-service/azure-app-service-host',
                },
                {
                  label: 'Client integration',
                  slug: 'integrations/cloud/azure/azure-app-service/azure-app-service-connect',
                },
              ],
            },
            {
              label: 'Azure Application Insights',
              slug: 'integrations/cloud/azure/azure-application-insights',
            },
            {
              label: 'Azure Cache for Redis',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  slug: 'integrations/cloud/azure/azure-cache-redis/azure-cache-redis-get-started',
                },
                {
                  label: 'Set up Azure Cache for Redis in the AppHost',
                  slug: 'integrations/cloud/azure/azure-cache-redis/azure-cache-redis-host',
                },
                {
                  label: 'Client integration',
                  slug: 'integrations/cloud/azure/azure-cache-redis/azure-cache-redis-connect',
                },
              ],
            },
            {
              label: 'Azure Container Registry',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  slug: 'integrations/cloud/azure/azure-container-registry/azure-container-registry-get-started',
                },
                {
                  label: 'Set up Azure Container Registry in the AppHost',
                  slug: 'integrations/cloud/azure/azure-container-registry/azure-container-registry-host',
                },
                {
                  label: 'Client integration',
                  slug: 'integrations/cloud/azure/azure-container-registry/azure-container-registry-connect',
                },
              ],
            },
            {
              label: 'Azure Kubernetes Service (AKS)',
              slug: 'integrations/cloud/azure/aks',
            },
            {
              label: 'Azure Cosmos DB',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  slug: 'integrations/cloud/azure/azure-cosmos-db/azure-cosmos-db-get-started',
                },
                {
                  label: 'Set up Azure Cosmos DB in the AppHost',
                  slug: 'integrations/cloud/azure/azure-cosmos-db/azure-cosmos-db-host',
                },
                {
                  label: 'Client integration',
                  slug: 'integrations/cloud/azure/azure-cosmos-db/azure-cosmos-db-connect',
                },
              ],
            },
            {
              label: 'Azure Data Explorer',
              slug: 'integrations/cloud/azure/azure-data-explorer',
            },
            {
              label: 'Azure Event Hubs',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  slug: 'integrations/cloud/azure/azure-event-hubs/azure-event-hubs-get-started',
                },
                {
                  label: 'Set up Azure Event Hubs in the AppHost',
                  slug: 'integrations/cloud/azure/azure-event-hubs/azure-event-hubs-host',
                },
                {
                  label: 'Client integration',
                  slug: 'integrations/cloud/azure/azure-event-hubs/azure-event-hubs-connect',
                },
              ],
            },
            {
              label: 'Azure Front Door',
              slug: 'integrations/cloud/azure/azure-front-door',
            },
            {
              label: 'Azure Functions',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  slug: 'integrations/cloud/azure/azure-functions/azure-functions-get-started',
                },
                {
                  label: 'Set up Azure Functions in the AppHost',
                  slug: 'integrations/cloud/azure/azure-functions/azure-functions-host',
                },
                {
                  label: 'Client integration',
                  slug: 'integrations/cloud/azure/azure-functions/azure-functions-connect',
                },
              ],
            },
            {
              label: 'Azure Key Vault',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  slug: 'integrations/cloud/azure/azure-key-vault/azure-key-vault-get-started',
                },
                {
                  label: 'Set up Azure Key Vault in the AppHost',
                  slug: 'integrations/cloud/azure/azure-key-vault/azure-key-vault-host',
                },
                {
                  label: 'Client integration',
                  slug: 'integrations/cloud/azure/azure-key-vault/azure-key-vault-connect',
                },
              ],
            },
            {
              label: 'Azure Log Analytics',
              slug: 'integrations/cloud/azure/azure-log-analytics',
            },
            {
              label: 'Azure PostgreSQL',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  slug: 'integrations/cloud/azure/azure-postgresql/azure-postgresql-get-started',
                },
                {
                  label: 'Set up Azure PostgreSQL in the AppHost',
                  slug: 'integrations/cloud/azure/azure-postgresql/azure-postgresql-host',
                },
                {
                  label: 'Connect to Azure PostgreSQL',
                  slug: 'integrations/cloud/azure/azure-postgresql/azure-postgresql-connect',
                },
              ],
            },
            {
              label: 'Azure Service Bus',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  slug: 'integrations/cloud/azure/azure-service-bus/azure-service-bus-get-started',
                },
                {
                  label: 'Set up Azure Service Bus in the AppHost',
                  slug: 'integrations/cloud/azure/azure-service-bus/azure-service-bus-host',
                },
                {
                  label: 'Client integration',
                  slug: 'integrations/cloud/azure/azure-service-bus/azure-service-bus-connect',
                },
              ],
            },
            {
              label: 'Azure SignalR Service',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  slug: 'integrations/cloud/azure/azure-signalr/azure-signalr-get-started',
                },
                {
                  label: 'Set up Azure SignalR Service in the AppHost',
                  slug: 'integrations/cloud/azure/azure-signalr/azure-signalr-host',
                },
                {
                  label: 'Hub host integration',
                  slug: 'integrations/cloud/azure/azure-signalr/azure-signalr-connect',
                },
              ],
            },
            {
              label: 'Azure SQL Database',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  slug: 'integrations/cloud/azure/azure-sql-database/azure-sql-database-get-started',
                },
                {
                  label: 'Set up Azure SQL Database in the AppHost',
                  slug: 'integrations/cloud/azure/azure-sql-database/azure-sql-database-host',
                },
                {
                  label: 'Client integration',
                  slug: 'integrations/cloud/azure/azure-sql-database/azure-sql-database-connect',
                },
              ],
            },
            {
              label: 'Azure Storage Blobs',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  slug: 'integrations/cloud/azure/azure-storage-blobs/azure-storage-blobs-get-started',
                },
                {
                  label: 'Hosting integration',
                  slug: 'integrations/cloud/azure/azure-storage-blobs/azure-storage-blobs-host',
                },
                {
                  label: 'Client integration',
                  slug: 'integrations/cloud/azure/azure-storage-blobs/azure-storage-blobs-connect',
                },
              ],
            },
            {
              label: 'Azure Data Lake Storage',
              slug: 'integrations/cloud/azure/azure-storage-datalake',
            },
            {
              label: 'Azure Storage Queues',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  slug: 'integrations/cloud/azure/azure-storage-queues/azure-storage-queues-get-started',
                },
                {
                  label: 'Hosting integration',
                  slug: 'integrations/cloud/azure/azure-storage-queues/azure-storage-queues-host',
                },
                {
                  label: 'Client integration',
                  slug: 'integrations/cloud/azure/azure-storage-queues/azure-storage-queues-connect',
                },
              ],
            },
            {
              label: 'Azure Storage Tables',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  slug: 'integrations/cloud/azure/azure-storage-tables/azure-storage-tables-get-started',
                },
                {
                  label: 'Hosting integration',
                  slug: 'integrations/cloud/azure/azure-storage-tables/azure-storage-tables-host',
                },
                {
                  label: 'Client integration',
                  slug: 'integrations/cloud/azure/azure-storage-tables/azure-storage-tables-connect',
                },
              ],
            },
            {
              label: 'Azure Virtual Network',
              slug: 'integrations/cloud/azure/azure-virtual-network',
            },
            {
              label: 'Azure Web PubSub',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  slug: 'integrations/cloud/azure/azure-web-pubsub/azure-web-pubsub-get-started',
                },
                {
                  label: 'Hosting integration',
                  slug: 'integrations/cloud/azure/azure-web-pubsub/azure-web-pubsub-host',
                },
                {
                  label: 'Client integration',
                  slug: 'integrations/cloud/azure/azure-web-pubsub/azure-web-pubsub-connect',
                },
              ],
            },
            {
              label: 'Azure Container App Jobs',
              slug: 'integrations/cloud/azure/container-app-jobs',
            },
            {
              label: 'User-assigned managed identity',
              slug: 'integrations/cloud/azure/user-assigned-identity',
            },
            {
              label: 'Manage role assignments',
              slug: 'integrations/cloud/azure/role-assignments',
            },
          ],
        },
      ],
    },
    {
      label: 'Caching & state',
      collapsed: true,
      translations: {
        da: 'Caching og tilstand',
        de: 'Caching & Zustand',
        en: 'Caching & state',
        es: 'Caché y estado',
        fr: 'Mise en cache et état',
        hi: 'कैशिंग और स्थिति',
        id: 'Caching & State',
        it: 'Caching e stato',
        ja: 'キャッシングと状態',
        ko: '캐싱 및 상태',
        'pt-BR': 'Cache e Estado',
        ru: 'Кэширование и состояние',
        tr: 'Önbellekleme ve Durum',
        uk: 'Кешування та стан',
        'zh-CN': '缓存与状态',
      },
      items: [
        {
          label: 'Redis',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/caching/redis/redis-get-started',
            },
            {
              label: 'Set up Redis in the AppHost',
              slug: 'integrations/caching/redis/redis-host',
            },
            {
              label: 'Connect to Redis',
              slug: 'integrations/caching/redis/redis-connect',
            },
            {
              label: 'Community extensions',
              slug: 'integrations/caching/redis-extensions',
            },
          ],
        },
        {
          label: 'Redis Distributed Cache',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/caching/redis-distributed/redis-distributed-get-started',
            },
            {
              label: 'Set up Redis Distributed Cache in the AppHost',
              slug: 'integrations/caching/redis-distributed/redis-distributed-host',
            },
            {
              label: 'Connect to Redis Distributed Cache',
              slug: 'integrations/caching/redis-distributed/redis-distributed-connect',
            },
          ],
        },
        {
          label: 'Redis Output Cache',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/caching/redis-output/redis-output-get-started',
            },
            {
              label: 'Set up Redis Output Cache in the AppHost',
              slug: 'integrations/caching/redis-output/redis-output-host',
            },
            {
              label: 'Connect to Redis Output Cache',
              slug: 'integrations/caching/redis-output/redis-output-connect',
            },
          ],
        },
        {
          label: 'Valkey',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/caching/valkey/valkey-get-started',
            },
            {
              label: 'Set up Valkey in the AppHost',
              slug: 'integrations/caching/valkey/valkey-host',
            },
            {
              label: 'Connect to Valkey',
              slug: 'integrations/caching/valkey/valkey-connect',
            },
          ],
        },
        {
          label: 'Garnet',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/caching/garnet/garnet-get-started',
            },
            {
              label: 'Set up Garnet in the AppHost',
              slug: 'integrations/caching/garnet/garnet-host',
            },
            {
              label: 'Connect to Garnet',
              slug: 'integrations/caching/garnet/garnet-connect',
            },
          ],
        },
      ],
    },
    {
      label: 'Compute & hosting',
      collapsed: true,
      translations: {
        da: 'Compute og hosting',
        de: 'Compute & hosting',
        en: 'Compute & hosting',
        es: 'Computación y alojamiento',
        fr: 'Calcul et hébergement',
        hi: 'कंप्यूट और होस्टिंग',
        id: 'Komputasi & hosting',
        it: 'Calcolo e hosting',
        ja: 'コンピューティングとホスティング',
        ko: '컴퓨팅 및 호스팅',
        'pt-BR': 'Computação e hospedagem',
        ru: 'Вычисления и хостинг',
        tr: 'Hesaplama ve Barındırma',
        uk: 'Обчислення та хостинг',
        'zh-CN': '计算与托管',
      },
      items: [
        { label: 'Docker', slug: 'integrations/compute/docker' },
        { label: 'Kubernetes', slug: 'integrations/compute/kubernetes' },
      ],
    },
    {
      label: 'Data & databases',
      collapsed: true,
      translations: {
        da: 'Database',
        de: 'Datenbank',
        en: 'Data & databases',
        es: 'Base de datos',
        fr: 'Base de données',
        hi: 'डेटाबेस',
        id: 'Basis Data',
        it: 'Database',
        ja: 'データベース',
        ko: '데이터베이스',
        'pt-BR': 'Banco de dados',
        ru: 'База данных',
        tr: 'Veritabanı',
        uk: 'База даних',
        'zh-CN': '数据库',
      },
      items: [
        {
          label: 'ClickHouse',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/databases/clickhouse/clickhouse-get-started',
            },
            {
              label: 'Set up ClickHouse in the AppHost',
              slug: 'integrations/databases/clickhouse/clickhouse-host',
            },
            {
              label: 'Connect to ClickHouse',
              slug: 'integrations/databases/clickhouse/clickhouse-connect',
            },
          ],
        },
        {
          label: 'Elasticsearch',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/databases/elasticsearch/elasticsearch-get-started',
            },
            {
              label: 'Set up Elasticsearch in the AppHost',
              slug: 'integrations/databases/elasticsearch/elasticsearch-host',
            },
            {
              label: 'Connect to Elasticsearch',
              slug: 'integrations/databases/elasticsearch/elasticsearch-connect',
            },
          ],
        },
        {
          label: 'Entity Framework Core',
          collapsed: true,
          items: [
            {
              label: 'Overview',
              slug: 'integrations/databases/efcore/overview',
            },
            {
              label: 'Apply migrations',
              slug: 'integrations/databases/efcore/migrations',
            },
            {
              label: 'Seed data',
              slug: 'integrations/databases/efcore/seed-database',
            },
            {
              label: 'Azure Cosmos DB',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  slug: 'integrations/databases/efcore/azure-cosmos-db/azure-cosmos-db-get-started',
                },
                {
                  label: 'Set up Entity Framework Core in the AppHost',
                  slug: 'integrations/databases/efcore/azure-cosmos-db/azure-cosmos-db-host',
                },
                {
                  label: 'Connect to Entity Framework Core',
                  slug: 'integrations/databases/efcore/azure-cosmos-db/azure-cosmos-db-connect',
                },
              ],
            },
            {
              label: 'Azure PostgreSQL',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  slug: 'integrations/databases/efcore/azure-postgresql/azure-postgresql-get-started',
                },
                {
                  label: 'Connect to Azure PostgreSQL',
                  slug: 'integrations/databases/efcore/azure-postgresql/azure-postgresql-connect',
                },
              ],
            },
            {
              label: 'Azure SQL',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  slug: 'integrations/databases/efcore/azure-sql/azure-sql-get-started',
                },
                {
                  label: 'Set up Azure SQL in the AppHost',
                  slug: 'integrations/databases/efcore/azure-sql/azure-sql-host',
                },
                {
                  label: 'Connect to Azure SQL',
                  slug: 'integrations/databases/efcore/azure-sql/azure-sql-connect',
                },
              ],
            },
            {
              label: 'MySQL Pomelo',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  slug: 'integrations/databases/efcore/mysql/mysql-get-started',
                },
                {
                  label: 'Connect to MySQL Pomelo',
                  slug: 'integrations/databases/efcore/mysql/mysql-connect',
                },
              ],
            },
            {
              label: 'MongoDB',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  slug: 'integrations/databases/efcore/mongodb/mongodb-efcore-get-started',
                },
                {
                  label: 'Connect to MongoDB',
                  slug: 'integrations/databases/efcore/mongodb/mongodb-efcore-connect',
                },
              ],
            },
            {
              label: 'Oracle',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  slug: 'integrations/databases/efcore/oracle/oracle-get-started',
                },
                {
                  label: 'Set up Oracle in the AppHost',
                  slug: 'integrations/databases/efcore/oracle/oracle-host',
                },
                {
                  label: 'Connect to Oracle',
                  slug: 'integrations/databases/efcore/oracle/oracle-connect',
                },
              ],
            },
            {
              label: 'PostgreSQL',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  slug: 'integrations/databases/efcore/postgres/postgresql-get-started',
                },
                {
                  label: 'Connect to PostgreSQL',
                  slug: 'integrations/databases/efcore/postgres/postgresql-connect',
                },
              ],
            },
            {
              label: 'SQL Server',
              collapsed: true,
              items: [
                {
                  label: 'Get started',
                  slug: 'integrations/databases/efcore/sql-server/sql-server-get-started',
                },
                {
                  label: 'Connect to SQL Server',
                  slug: 'integrations/databases/efcore/sql-server/sql-server-connect',
                },
              ],
            },
          ],
        },
        {
          label: 'KurrentDB',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/databases/kurrentdb/kurrentdb-get-started',
            },
            {
              label: 'Set up KurrentDB in the AppHost',
              slug: 'integrations/databases/kurrentdb/kurrentdb-host',
            },
            {
              label: 'Connect to KurrentDB',
              slug: 'integrations/databases/kurrentdb/kurrentdb-connect',
            },
          ],
        },
        {
          label: 'Meilisearch',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/databases/meilisearch/meilisearch-get-started',
            },
            {
              label: 'Set up Meilisearch in the AppHost',
              slug: 'integrations/databases/meilisearch/meilisearch-host',
            },
            {
              label: 'Connect to Meilisearch',
              slug: 'integrations/databases/meilisearch/meilisearch-connect',
            },
          ],
        },
        {
          label: 'Milvus',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/databases/milvus/milvus-get-started',
            },
            {
              label: 'Set up Milvus in the AppHost',
              slug: 'integrations/databases/milvus/milvus-host',
            },
            {
              label: 'Connect to Milvus',
              slug: 'integrations/databases/milvus/milvus-connect',
            },
          ],
        },
        {
          label: 'MongoDB',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/databases/mongodb/mongodb-get-started',
            },
            {
              label: 'Set up MongoDB in the AppHost',
              slug: 'integrations/databases/mongodb/mongodb-host',
            },
            {
              label: 'Connect to MongoDB',
              slug: 'integrations/databases/mongodb/mongodb-connect',
            },
            {
              label: 'Community extensions',
              slug: 'integrations/databases/mongodb/mongodb-extensions',
            },
          ],
        },
        {
          label: 'MySQL',
          collapsed: true,
          items: [
            {
              label: 'Integration overview',
              slug: 'integrations/databases/mysql/mysql-get-started',
            },
            {
              label: 'Set up MySQL in the AppHost',
              slug: 'integrations/databases/mysql/mysql-host',
            },
            {
              label: 'Connect to MySQL',
              slug: 'integrations/databases/mysql/mysql-connect',
            },
            {
              label: 'Community extensions',
              slug: 'integrations/databases/mysql/mysql-extensions',
            },
          ],
        },
        {
          label: 'PostgreSQL',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/databases/postgres/postgres-get-started',
            },
            {
              label: 'Set up PostgreSQL in the AppHost',
              slug: 'integrations/databases/postgres/postgres-host',
            },
            {
              label: 'Connect to PostgreSQL',
              slug: 'integrations/databases/postgres/postgres-connect',
            },
            {
              label: 'Use community extensions',
              slug: 'integrations/databases/postgres/postgresql-extensions',
            },
          ],
        },
        {
          label: 'Qdrant',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/databases/qdrant/qdrant-get-started',
            },
            {
              label: 'Set up Qdrant in the AppHost',
              slug: 'integrations/databases/qdrant/qdrant-host',
            },
            {
              label: 'Connect to Qdrant',
              slug: 'integrations/databases/qdrant/qdrant-connect',
            },
          ],
        },
        {
          label: 'RavenDB',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/databases/ravendb/ravendb-get-started',
            },
            {
              label: 'Set up RavenDB in the AppHost',
              slug: 'integrations/databases/ravendb/ravendb-host',
            },
            {
              label: 'Connect to RavenDB',
              slug: 'integrations/databases/ravendb/ravendb-connect',
            },
          ],
        },
        {
          label: 'SQL Server',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/databases/sql-server/sql-server-get-started',
            },
            {
              label: 'Set up SQL Server in the AppHost',
              slug: 'integrations/databases/sql-server/sql-server-host',
            },
            {
              label: 'Connect to SQL Server',
              slug: 'integrations/databases/sql-server/sql-server-connect',
            },
            {
              label: 'Community extensions',
              slug: 'integrations/databases/sql-server/sql-server-extensions',
            },
          ],
        },
        { 
          label: 'SQLite',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/databases/sqlite/sqlite-get-started',
            },
            {
              label: 'Set up SQLite in the AppHost',
              slug: 'integrations/databases/sqlite/sqlite-host',
            },
            {
              label: 'Connect to SQLite',
              slug: 'integrations/databases/sqlite/sqlite-connect',
            },
          ],
        },
        {
          label: 'SurrealDB',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/databases/surrealdb/surrealdb-get-started',
            },
            {
              label: 'Set up SurrealDB in the AppHost',
              slug: 'integrations/databases/surrealdb/surrealdb-host',
            },
            {
              label: 'Connect to SurrealDB',
              slug: 'integrations/databases/surrealdb/surrealdb-connect',
            },
          ],
        },
      ],
    },
    {
      label: 'Frameworks & runtimes',
      collapsed: true,
      translations: {
        da: 'Frameworks og runtime-miljøer',
        de: 'Frameworks & Laufzeiten',
        en: 'Frameworks & runtimes',
        es: 'Frameworks y entornos de ejecución',
        fr: "Frameworks et environnements d'exécution",
        hi: 'फ्रेमवर्क और रनटाइम',
        id: 'Kerangka & Runtime',
        it: 'Framework e runtime',
        ja: 'フレームワークとランタイム',
        ko: '프레임워크 및 런타임',
        'pt-BR': 'Frameworks e Runtimes',
        ru: 'Фреймворки и среды выполнения',
        tr: 'Çerçeveler ve Çalışma Zamanları',
        uk: 'Фреймворки та середовища виконання',
        'zh-CN': '框架和运行时',
      },
      items: [
        {
          label: 'C# and .NET',
          collapsed: true,
          translations: {
            da: 'C# og .NET',
            de: 'C# und .NET',
            en: 'C# and .NET',
            es: 'C# y .NET',
            fr: 'C# et .NET',
            hi: 'C# और .NET',
            id: 'C# dan .NET',
            it: 'C# e .NET',
            ja: 'C# と .NET',
            ko: 'C# 및 .NET',
            'pt-BR': 'C# e .NET',
            ru: 'C# и .NET',
            tr: 'C# ve .NET',
            uk: 'C# і .NET',
            'zh-CN': 'C# 和 .NET',
          },
          items: [
            { label: 'Project resources', slug: 'integrations/dotnet/project-resources' },
            { label: 'C# file-based apps', slug: 'integrations/dotnet/csharp-file-based-apps' },
            { label: 'Launch profiles', slug: 'integrations/dotnet/launch-profiles' },
            { label: '.NET tool resources', slug: 'integrations/dotnet/dotnet-tool-resources' },
            { label: '.NET MAUI', slug: 'integrations/dotnet/maui' },
            { label: 'WPF and Windows Forms', slug: 'integrations/frameworks/wpf-winforms' },
            { label: 'Orleans', slug: 'integrations/frameworks/orleans' },
          ],
        },
        { label: 'Dapr', slug: 'integrations/frameworks/dapr' },
        { label: 'Go', slug: 'integrations/frameworks/go-apps' },
        { label: 'Java', slug: 'integrations/frameworks/java' },
        {
          label: 'JavaScript and Node.js',
          collapsed: true,
          translations: {
            da: 'JavaScript og Node.js',
            de: 'JavaScript und Node.js',
            en: 'JavaScript and Node.js',
            es: 'JavaScript y Node.js',
            fr: 'JavaScript et Node.js',
            hi: 'JavaScript और Node.js',
            id: 'JavaScript dan Node.js',
            it: 'JavaScript e Node.js',
            ja: 'JavaScript と Node.js',
            ko: 'JavaScript 및 Node.js',
            'pt-BR': 'JavaScript e Node.js',
            ru: 'JavaScript и Node.js',
            tr: 'JavaScript ve Node.js',
            uk: 'JavaScript і Node.js',
            'zh-CN': 'JavaScript 和 Node.js',
          },
          items: [
            { label: 'Bun', slug: 'integrations/frameworks/bun-apps' },
            { label: 'Deno', slug: 'integrations/frameworks/deno-apps' },
            { label: 'JavaScript', slug: 'integrations/frameworks/javascript' },
            { label: 'Node.js extensions', slug: 'integrations/frameworks/nodejs-extensions' },
          ],
        },
        { label: 'PowerShell', slug: 'integrations/frameworks/powershell' },
        { label: 'Python', slug: 'integrations/frameworks/python' },
        { label: 'Rust', slug: 'integrations/frameworks/rust' },
      ],
    },
    {
      label: 'Messaging & eventing',
      collapsed: true,
      translations: {
        da: 'Meddelelser',
        de: 'Messaging',
        en: 'Messaging & eventing',
        es: 'Mensajería',
        fr: 'Messagerie',
        hi: 'मैसेजिंग',
        id: 'Pengiriman Pesan',
        it: 'Messaggistica',
        ja: 'メッセージング',
        ko: '메시징',
        'pt-BR': 'Mensageria',
        ru: 'Обмен сообщениями',
        tr: 'Mesajlaşma',
        uk: 'Обмін повідомленнями',
        'zh-CN': '消息传递',
      },
      items: [
        {
          label: 'Apache Kafka',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/messaging/apache-kafka/apache-kafka-get-started',
            },
            {
              label: 'Set up Apache Kafka in the AppHost',
              slug: 'integrations/messaging/apache-kafka/apache-kafka-host',
            },
            {
              label: 'Connect to Apache Kafka',
              slug: 'integrations/messaging/apache-kafka/apache-kafka-connect',
            },
          ],
        },
        { label: 'LavinMQ', slug: 'integrations/messaging/lavinmq' },
        {
          label: 'NATS',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/messaging/nats/nats-get-started',
            },
            {
              label: 'Set up NATS in the AppHost',
              slug: 'integrations/messaging/nats/nats-host',
            },
            {
              label: 'Connect to NATS',
              slug: 'integrations/messaging/nats/nats-connect',
            },
          ],
        },
        {
          label: 'RabbitMQ',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/messaging/rabbitmq/rabbitmq-get-started',
            },
            {
              label: 'Set up RabbitMQ in the AppHost',
              slug: 'integrations/messaging/rabbitmq/rabbitmq-host',
            },
            {
              label: 'Connect to RabbitMQ',
              slug: 'integrations/messaging/rabbitmq/rabbitmq-connect',
            },
          ],
        },
      ],
    },
    {
      label: 'Security & identity',
      collapsed: true,
      translations: {
        da: 'Sikkerhed og identitet',
        de: 'Sicherheit & Identität',
        en: 'Security & identity',
        es: 'Seguridad e identidad',
        fr: 'Sécurité et identité',
        hi: 'सुरक्षा और पहचान',
        id: 'Keamanan & Identitas',
        it: 'Sicurezza e identità',
        ja: 'セキュリティとアイデンティティ',
        ko: '보안 및 ID',
        'pt-BR': 'Segurança e Identidade',
        ru: 'Безопасность и идентификация',
        tr: 'Güvenlik ve Kimlik',
        uk: 'Безпека та ідентичність',
        'zh-CN': '安全与身份',
      },
      items: [{ label: 'Keycloak', slug: 'integrations/security/keycloak' }],
    },
    {
      label: 'Observability & logging',
      collapsed: true,
      translations: {
        da: 'Observerbarhed og logning',
        de: 'Beobachtbarkeit & Protokollierung',
        en: 'Observability & logging',
        es: 'Observabilidad y registro',
        fr: 'Observabilité et journalisation',
        hi: 'पर्यवेक्षण और लॉगिंग',
        id: 'Observabilitas & Logging',
        it: 'Osservabilità e registrazione',
        ja: '可観測性とログ記録',
        ko: '관측 가능성 및 로깅',
        'pt-BR': 'Observabilidade e Registro',
        ru: 'Наблюдаемость и ведение журналов',
        tr: 'Gözlemlenebilirlik ve Günlük Kaydı',
        uk: 'Спостережуваність та ведення журналів',
        'zh-CN': '可观察性与日志记录',
      },
      items: [
        {
          label: 'Seq',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/observability/seq/seq-get-started',
            },
            {
              label: 'Set up Seq in the AppHost',
              slug: 'integrations/observability/seq/seq-host',
            },
            {
              label: 'Connect to Seq',
              slug: 'integrations/observability/seq/seq-connect',
            },
          ],
        },
      ],
    },
    {
      label: 'Reverse proxies & APIs',
      collapsed: true,
      translations: {
        da: "Reverse proxies & API'er",
        de: 'Reverse Proxies & APIs',
        en: 'Reverse proxies & APIs',
        es: 'Reverse proxies y APIs',
        fr: 'Reverse proxies et APIs',
        hi: 'रिवर्स प्रॉक्सी और एपीआई',
        id: 'Reverse Proxies & API',
        it: 'Reverse proxy e API',
        ja: 'リバースプロキシとAPI',
        ko: '리버스 프록시 및 API',
        'pt-BR': 'Reverse Proxies e APIs',
        ru: 'Обратные прокси и API',
        tr: "Ters Proxyler ve API'ler",
        uk: 'Зворотні проксі та API',
        'zh-CN': '反向代理和API',
      },
      items: [
        {
          label: 'YARP (Yet Another Reverse Proxy)',
          slug: 'integrations/reverse-proxies/yarp',
        },
      ],
    },
    {
      label: 'Dev tools & extensions',
      collapsed: true,
      translations: {
        da: 'Dev-værktøjer og udvidelser',
        de: 'Dev-Tools & Erweiterungen',
        en: 'Dev tools & extensions',
        es: 'Herramientas de desarrollo y extensiones',
        fr: 'Outils de développement et extensions',
        hi: 'डेव टूल्स और एक्सटेंशन',
        id: 'Alat & Ekstensi Dev',
        it: 'Strumenti di sviluppo ed estensioni',
        ja: '開発ツールと拡張機能',
        ko: '개발 도구 및 확장 프로그램',
        'pt-BR': 'Ferramentas e Extensões de Desenvolvimento',
        ru: 'Инструменты разработчика и расширения',
        tr: 'Geliştirici Araçları ve Uzantılar',
        uk: 'Інструменти розробника та розширення',
        'zh-CN': '开发工具和扩展',
      },
      items: [
        {
          label: 'Browser logs',
          translations: {
            da: 'Browserlogfiler',
            de: 'Browserprotokolle',
            en: 'Browser logs',
            es: 'Registros del navegador',
            fr: 'Journaux du navigateur',
            hi: 'ब्राउज़र लॉग',
            id: 'Log browser',
            it: 'Log del browser',
            ja: 'ブラウザーログ',
            ko: '브라우저 로그',
            'pt-BR': 'Logs do navegador',
            ru: 'Журналы браузера',
            tr: 'Tarayıcı günlükleri',
            uk: 'Журнали браузера',
            'zh-CN': '浏览器日志',
          },
          slug: 'integrations/devtools/browser-logs',
        },
        { label: 'Data API Builder', slug: 'integrations/devtools/dab' },
        { label: 'Dev Tunnels', slug: 'integrations/devtools/dev-tunnels' },
        {
          label: 'flagd',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/devtools/flagd/flagd-get-started',
            },
            {
              label: 'Set up flagd in the AppHost',
              slug: 'integrations/devtools/flagd/flagd-host',
            },
            {
              label: 'Connect to flagd',
              slug: 'integrations/devtools/flagd/flagd-connect',
            },
          ],
        },
        {
          label: 'goff',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/devtools/goff/goff-get-started',
            },
            {
              label: 'Set up goff in the AppHost',
              slug: 'integrations/devtools/goff/goff-host',
            },
            {
              label: 'Connect to goff',
              slug: 'integrations/devtools/goff/goff-connect',
            },
          ],
        },
        { label: 'k6', slug: 'integrations/devtools/k6' },
        {
          label: 'MailPit',
          collapsed: true,
          items: [
            {
              label: 'Get started',
              slug: 'integrations/devtools/mailpit/mailpit-get-started',
            },
            {
              label: 'Set up MailPit in the AppHost',
              slug: 'integrations/devtools/mailpit/mailpit-host',
            },
            {
              label: 'Connect to MailPit',
              slug: 'integrations/devtools/mailpit/mailpit-connect',
            },
          ],
        },
        {
          label: 'SQL Database Projects',
          slug: 'integrations/devtools/sql-projects',
        },
      ],
    },
  ],
};
