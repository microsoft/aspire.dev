import samples from './samples.json';
import { aspireProject } from './aspire-project';
import { sampleDetailHref } from '../utils/samples';
import { topics } from '../utils/dev-center/topics';

export const devTitle = 'Dev Hub';
export const devDescription = 'Find guides, working samples, and reference docs for your next Aspire app.';
export const gettingStartedDescription = `${aspireProject.description} Start with the Quickstart, or choose a path that fits what you want to do.`;

const topicDestinations = {
  foundations: { href: '/docs/', description: 'AppHosts, resources, and the concepts behind your app.', action: 'Learn the fundamentals' },
  integrations: { href: '/integrations/', description: 'Databases, messaging, AI, and services that work together.', action: 'Find an integration' },
  dashboard: { href: '/dashboard/', description: 'See your running app through logs, traces, and metrics.', action: 'Explore the dashboard' },
  deployment: { href: '/deployment/', description: 'Take your app from local development to production.', action: 'Choose a deployment target' },
  reference: { href: '/reference/overview/', description: 'APIs, CLI commands, container images, and diagnostics.', action: 'Find a reference' },
  community: { href: '/community/', description: 'Videos, contributions, and people building with Aspire.', action: 'Join the community' },
};
export const topicLinks = topics.map((topic) => ({ ...topic, ...topicDestinations[topic.id] }));

export const resources = [
  { title: 'Quickstart', description: 'Create and run your first app.', href: '/get-started/first-app/', icon: 'rocket', color: 'var(--sl-color-purple)' },
  { title: 'Tutorial', description: 'Have an app running locally? Deploy it to the cloud, step by step.', href: '/get-started/deploy-first-app/', icon: 'open-book', color: 'var(--sl-color-orange)' },
  { title: 'How-to', description: 'Already have a project? Add Aspire without starting over.', href: '/get-started/add-aspire-existing-app/', icon: 'pencil', color: 'var(--sl-color-green)' },
  { title: 'Glossary', description: 'Learning the vocabulary? Explore key concepts with practical examples.', href: '/dev/glossary/', icon: 'notes', color: 'var(--color-cyan)' },
] as const;

export const languages = [
  { title: 'C# / .NET', description: 'Build your first app', href: '/get-started/first-app/?aspire-lang=csharp', icon: 'seti:c-sharp', color: 'var(--sl-color-purple)' },
  { title: 'JavaScript / TypeScript', description: 'Connect your frontend and API', href: '/integrations/frameworks/javascript/', icon: 'seti:typescript', color: 'var(--sl-color-blue)' },
  { title: 'Python', description: 'Run Python apps with Aspire', href: '/integrations/frameworks/python/', icon: 'seti:python', color: 'var(--sl-color-orange)' },
  { title: 'Go', description: 'Add a Go service', href: '/integrations/frameworks/go/go-get-started/', icon: 'seti:go', color: 'var(--color-cyan)' },
  { title: 'Java', description: 'Orchestrate your Java app', href: '/integrations/frameworks/java/java-get-started/', icon: 'seti:java', color: 'var(--sl-color-orange)' },
  { title: 'Rust', description: 'Get started with Rust', href: '/integrations/frameworks/rust/rust-get-started/', icon: 'seti:rust', color: 'var(--color-magenta)' },
] as const;

export const referenceLinks = [
  { title: 'CLI commands', description: 'Create, run, deploy, and troubleshoot from your terminal.', href: '/reference/cli/overview/', icon: 'seti:powershell' },
  { title: 'TypeScript API', description: 'Explore the AppHost modules, functions, and resource types.', href: '/reference/api/typescript/', icon: 'seti:typescript' },
  { title: 'C# API', description: 'Find packages, types, methods, and extension APIs.', href: '/reference/api/csharp/', icon: 'seti:c-sharp' },
  { title: 'Container images', description: 'Find the images and tags used by Aspire integrations.', href: '/reference/container-images/', icon: 'seti:docker' },
  { title: 'Diagnostics', description: 'Look up a diagnostic code and how to resolve it.', href: '/diagnostics/overview/', icon: 'seti:config' },
] as const;

export const cloudLinks = [
  { id: 'aws', title: 'AWS', description: 'Connect AWS services, develop Lambda functions, and provision infrastructure.', href: '/integrations/cloud/aws/overview/', color: 'var(--sl-color-orange)' },
  { id: 'azure', title: 'Azure', description: 'Model, provision, and connect Azure services.', href: '/integrations/cloud/azure/overview/', color: 'var(--sl-color-blue)' },
  { id: 'kubernetes', title: 'Kubernetes', description: 'Publish Helm charts and deploy to your cluster.', href: '/deployment/kubernetes/', color: 'var(--sl-color-blue)' },
] as const;

export const blogHighlights = [
  {
    title: 'Aspire 13.5: Fresh pixels and better workflows',
    description: 'Explore the refreshed dashboard, live terminals, and new deployment capabilities.',
    date: '2026-08-18',
    href: 'https://devblogs.microsoft.com/aspire/whats-new-aspire-13-5/',
    image: 'https://devblogs.microsoft.com/aspire/wp-content/uploads/sites/90/2026/08/ChatGPT-Image-Aug-18-2026-03_59_09-PM-768x432.webp',
  },
  {
    title: 'Aspire in VS Code: the 13.4 developer loop',
    description: 'Run, debug, and inspect your app without leaving the editor.',
    date: '2026-06-16',
    href: 'https://devblogs.microsoft.com/aspire/aspire-vscode-extension-13-4/',
    image: 'https://devblogs.microsoft.com/aspire/wp-content/uploads/sites/90/2026/06/featured-image-768x365.webp',
  },
  {
    title: 'Distributed multi-agent systems with Aspire and Microsoft Agent Framework',
    description: 'See how the AlpineAI demo connects agents, services, and observability.',
    date: '2026-06-09',
    href: 'https://devblogs.microsoft.com/aspire/building-distributed-multi-agent-systems-with-aspire-and-microsoft-agent-framework/',
    image: 'https://devblogs.microsoft.com/aspire/wp-content/uploads/sites/90/2026/06/foundry-agents-alpineai-aspire-resources-768x512.webp',
  },
] as const;

const sampleHighlights = [
  { id: 'aspire-shop', title: 'Aspire Shop', description: 'A Blazor storefront with a PostgreSQL catalog and Redis shopping cart.' },
  { id: 'aspire-with-javascript', title: 'Angular, React, and Vue', description: 'Four JavaScript frontends connected to one weather API.' },
  { id: 'aspire-with-python', title: 'FastAPI + JavaScript', description: 'Run a Python API and JavaScript frontend together with Aspire.' },
  { id: 'golang-api', title: 'Go REST API', description: 'A Go service with in-memory storage, health checks, and an OpenAPI reference.' },
  { id: 'volume-mount', title: 'Persistent Volume', description: 'Keep user accounts across app restarts with Blazor, SQL Server, and persistent storage.' },
  { id: 'aspire-with-node', title: 'Node.js Weather Explorer', description: 'Explore live forecasts on a React map backed by an Express API and a TypeScript AppHost.' },
];
export const featuredSamples = sampleHighlights.map(({ id, title, description }) => {
  const sample = samples.find((sample) => sample.name === id);
  if (!sample) throw new Error(`Missing Developer Hub sample: ${id}`);
  return { name: id, title, description, tags: sample.tags, href: sampleDetailHref('', sample.name) };
});

export const dashboardLinks = [
  { title: 'Resources and health', href: '/dashboard/explore/#resources-page' },
  { title: 'Follow a distributed trace', href: '/dashboard/explore/#traces-page' },
  { title: 'Console logs', href: '/dashboard/explore/#console-logs-page' },
  { title: 'Structured logs', href: '/dashboard/explore/#structured-logs-page' },
  { title: 'Metrics', href: '/dashboard/explore/#metrics-page' },
  { title: 'AI coding agents', href: '/dashboard/ai-coding-agents/' },
  { title: 'Run it standalone', href: '/dashboard/standalone/' },
];

// Most recent uploads from https://www.youtube.com/@aspiredotdev/videos, newest first.
export const videos = [
  { title: 'Aspire Bytes: withReference and withEnvironment', id: '1D4PQiW3eqg', series: 'Aspire Bytes' },
  { title: 'Aspire 13.5 is here!', id: 'pEbo-qKif1U', series: 'Release highlights' },
];
