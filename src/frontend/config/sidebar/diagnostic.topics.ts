import type { StarlightSidebarTopicsUserConfig } from 'starlight-sidebar-topics';

export const diagnosticTopics: StarlightSidebarTopicsUserConfig = {
  label: {
    en: 'Diagnostics',
    es: 'Diagnósticos',
    fr: 'Diagnostics',
    de: 'Diagnose',
    it: 'Diagnostica',
    pt: 'Diagnósticos',
    ru: 'Диагностика',
    'zh-CN': '诊断',
    da: 'Diagnostik',
    hi: 'निदान',
    id: 'Diagnostik',
    ja: '診断',
    ko: '진단',
    'pt-BR': 'Diagnósticos',
    'pt-PT': 'Diagnósticos',
    tr: 'Tanılama',
    uk: 'Діагностика',
  },
  link: '/diagnostics/overview/',
  icon: 'warning',
  items: [
    { label: 'Overview', link: '/diagnostics/overview' },
    {
      label: 'Warnings',
      items: [
        { label: 'ASPIRE001', link: '/diagnostics/aspire001' },
        { label: 'ASPIRE002', link: '/diagnostics/aspire002' },
        { label: 'ASPIRE003', link: '/diagnostics/aspire003' },
        { label: 'ASPIRE004', link: '/diagnostics/aspire004' },
        {
          label: 'ASPIRECERTIFICATES001',
          link: '/diagnostics/aspirecertificates001',
        },
        {
          label: 'ASPIRECOMPUTE002',
          link: '/diagnostics/aspirecompute002',
        },
        {
          label: 'ASPIRECOMPUTE003',
          link: '/diagnostics/aspirecompute003',
        },
        {
          label: 'ASPIRECONTAINERRUNTIME001',
          link: '/diagnostics/aspirecontainerruntime001',
        },
        {
          label: 'ASPIREDOCKERFILEBUILDER001',
          link: '/diagnostics/aspiredockerfilebuilder001',
        },
        {
          label: 'ASPIREFILESYSTEM001',
          link: '/diagnostics/aspirefilesystem001',
        },
        {
          label: 'ASPIREPIPELINES004',
          link: '/diagnostics/aspirepipelines004',
        },
        {
          label: 'ASPIREPROBES001',
          link: '/diagnostics/aspireprobes001',
        },
        {
          label: 'ASPIREUSERSECRETS001',
          link: '/diagnostics/aspireusersecrets001',
        },
      ],
    },
    {
      label: 'Errors',
      items: [
        { label: 'ASPIRE006', link: '/diagnostics/aspire006' },
        { label: 'ASPIRE007', link: '/diagnostics/aspire007' },
        { label: 'ASPIRE008', link: '/diagnostics/aspire008' },
        {
          label: 'ASPIREACADOMAIN001',
          link: '/diagnostics/aspireacadomains001',
        },
        { label: 'ASPIRECOMPUTE001', link: '/diagnostics/aspirecompute001' },
        {
          label: 'ASPIRECSHARPAPPS001',
          link: '/diagnostics/aspirecsharpapps001',
        },
        {
          label: 'ASPIRECOSMOSDB001',
          link: '/diagnostics/aspirecosmosdb001',
        },
        {
          label: 'ASPIREHOSTINGPYTHON001',
          link: '/diagnostics/aspirehostingpython001',
        },
        {
          label: 'ASPIREPIPELINES001',
          link: '/diagnostics/aspirepipelines001',
        },
        {
          label: 'ASPIREPIPELINES002',
          link: '/diagnostics/aspirepipelines002',
        },
        {
          label: 'ASPIREPIPELINES003',
          link: '/diagnostics/aspirepipelines003',
        },
        {
          label: 'ASPIREPROXYENDPOINTS001',
          link: '/diagnostics/aspireproxyendpoints001',
        },
        {
          label: 'ASPIREPUBLISHERS001',
          link: '/diagnostics/aspirepublishers001',
        },
        { label: 'ASPIREAZURE001', link: '/diagnostics/aspireazure001' },
        { label: 'ASPIREAZURE002', link: '/diagnostics/aspireazure002' },
      ],
    },
  ],
};
