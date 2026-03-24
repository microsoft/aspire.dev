/**
 * Shared tag label mapping and formatter for sample components.
 */

export const TAG_LABELS: Record<string, string> = {
  'csharp': 'C#',
  'python': 'Python',
  'javascript': 'JavaScript',
  'node': 'Node.js',
  'go': 'Go',
  'redis': 'Redis',
  'postgresql': 'PostgreSQL',
  'sql-server': 'SQL Server',
  'mysql': 'MySQL',
  'mongodb': 'MongoDB',
  'rabbitmq': 'RabbitMQ',
  'kafka': 'Kafka',
  'prometheus': 'Prometheus',
  'grafana': 'Grafana',
  'docker': 'Docker',
  'azure': 'Azure',
  'azure-functions': 'Azure Functions',
  'azure-storage': 'Azure Storage',
  'azure-service-bus': 'Service Bus',
  'blazor': 'Blazor',
  'orleans': 'Orleans',
  'grpc': 'gRPC',
  'ef-core': 'EF Core',
  'metrics': 'Metrics',
  'health-checks': 'Health Checks',
  'containers': 'Containers',
  'databases': 'Databases',
  'migrations': 'Migrations',
  'volumes': 'Volumes',
  'dashboard': 'Dashboard',
};

export function tagLabel(tag: string): string {
  return TAG_LABELS[tag] || tag.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
