import type { StarlightSidebarTopicsUserConfig } from 'starlight-sidebar-topics';

export const deploymentTopics: StarlightSidebarTopicsUserConfig = {
  id: 'deployment',
  label: {
    da: 'Udrulning',
    de: 'Bereitstellung',
    en: 'Deployment',
    es: 'Despliegue',
    fr: 'Déploiement',
    hi: 'तैनाती',
    id: 'Penyebaran',
    it: 'Distribuzione',
    ja: 'デプロイ',
    ko: '배포',
    'pt-BR': 'Implantação',
    ru: 'Развертывание',
    tr: 'Dağıtım',
    uk: 'Розгортання',
    'zh-CN': '部署',
  },
  link: '/deployment/',
  icon: 'rocket',
  items: [
    {
      label: 'Deployment',
      translations: {
        da: 'Udrulning',
        de: 'Bereitstellung',
        en: 'Deployment',
        es: 'Despliegue',
        fr: 'Déploiement',
        hi: 'तैनाती',
        id: 'Penyebaran',
        it: 'Distribuzione',
        ja: 'デプロイ',
        ko: '배포',
        'pt-BR': 'Implantação',
        ru: 'Развертывание',
        tr: 'Dağıtım',
        uk: 'Розгортання',
        'zh-CN': '部署',
      },
      slug: 'deployment',
    },
    {
      label: 'Overview',
      translations: {
        da: 'Oversigt',
        de: 'Übersicht',
        en: 'Overview',
        es: 'Descripción general',
        fr: "Vue d'ensemble",
        hi: 'अवलोकन',
        id: 'Ikhtisar',
        it: 'Panoramica',
        ja: '概要',
        ko: '개요',
        'pt-BR': 'Visão geral',
        ru: 'Обзор',
        tr: 'Genel Bakış',
        uk: 'Огляд',
        'zh-CN': '概述',
      },
      slug: 'deployment/overview',
    },
    {
      label: 'Environments',
      slug: 'deployment/environments',
    },
    {
      label: 'Pipeline model',
      collapsed: false,
      items: [
        {
          label: 'Overview',
          slug: 'deployment/pipelines',
        },
        {
          label: 'Custom deployment pipelines',
          slug: 'deployment/custom-deployments',
        },
        {
          label: 'Deployment state caching',
          slug: 'deployment/deployment-state-caching',
        },
      ],
    },
    {
      label: 'CI/CD',
      collapsed: false,
      items: [
        {
          label: 'Overview',
          slug: 'deployment/ci-cd',
        },
        {
          label: 'Example app lifecycle workflow',
          slug: 'deployment/app-lifecycle',
        },
      ],
    },
    {
      label: 'JavaScript apps',
      slug: 'deployment/javascript-apps',
    },
    {
      label: 'Docker Compose',
      slug: 'deployment/docker-compose',
    },
    {
      label: 'Kubernetes',
      collapsed: false,
      items: [
        {
          label: 'Overview',
          slug: 'deployment/kubernetes',
        },
        {
          label: 'Kubernetes clusters',
          slug: 'deployment/kubernetes/kubernetes',
        },
        {
          label: 'Azure Kubernetes Service (AKS)',
          slug: 'deployment/kubernetes/aks',
        },
        {
          label: 'External Helm charts',
          slug: 'deployment/kubernetes/helm-charts',
        },
        {
          label: 'Ingress & Gateway API',
          slug: 'deployment/kubernetes-ingress',
        },
        {
          label: 'Gateway API on AKS',
          slug: 'deployment/kubernetes-gateway-aks',
        },
        {
          label: 'Ingress on AKS',
          slug: 'deployment/kubernetes-ingress-aks',
        },
      ],
    },
    {
      label: 'Custom deployment pipelines',
      translations: {
        da: 'Brugerdefinerede implementeringspipelines',
        de: 'Benutzerdefinierte Bereitstellungspipelines',
        en: 'Custom deployment pipelines',
        es: 'Canalizaciones de despliegue personalizadas',
        fr: 'Pipelines de déploiement personnalisés',
        hi: 'कस्टम तैनाती पाइपलाइन',
        id: 'Pipeline penyebaran kustom',
        it: 'Pipeline di distribuzione personalizzate',
        ja: 'カスタム デプロイ パイプライン',
        ko: '사용자 지정 배포 파이프라인',
        'pt-BR': 'Pipelines de implantação personalizados',
        ru: 'Пользовательские конвейеры развертывания',
        tr: 'Özel dağıtım işlem hatları',
        uk: 'Користувацькі конвеєри розгортання',
        'zh-CN': '自定义部署管道',
      },
      slug: 'deployment/custom-deployments',
    },
    {
      label: 'Deploy to Azure',
      collapsed: false,
      items: [
        {
          label: 'Overview',
          slug: 'deployment/azure',
        },
        {
          label: 'Deployment targets',
          collapsed: false,
          items: [
            {
              label: 'Azure Container Apps',
              slug: 'deployment/azure/container-apps',
            },
            {
              label: 'Azure App Service',
              slug: 'deployment/azure/app-service',
            },
          ],
        },
        {
          label: 'Guidance',
          collapsed: false,
          items: [
            {
              label: 'Customize Azure resources',
              slug: 'integrations/cloud/azure/customize-resources',
            },
            {
              label: 'Azure security best practices',
              translations: {
                da: 'Bedste praksis for Azure-sikkerhed',
                de: 'Bewährte Methoden für Azure-Sicherheit',
                en: 'Azure security best practices',
                es: 'Prácticas recomendadas de seguridad de Azure',
                fr: 'Bonnes pratiques de sécurité Azure',
                hi: 'Azure सुरक्षा सर्वोत्तम प्रथाएँ',
                id: 'Praktik terbaik keamanan Azure',
                it: 'Procedure consigliate per la sicurezza di Azure',
                ja: 'Azure セキュリティのベスト プラクティス',
                ko: 'Azure 보안 모범 사례',
                'pt-BR': 'Práticas recomendadas de segurança do Azure',
                ru: 'Рекомендации по безопасности Azure',
                tr: 'Azure güvenlik en iyi uygulamaları',
                uk: 'Найкращі практики безпеки Azure',
                'zh-CN': 'Azure 安全最佳实践',
              },
              slug: 'deployment/azure/azure-security-best-practices',
            },
          ],
        },
      ],
    },
  ],
};
