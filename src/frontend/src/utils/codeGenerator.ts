import type { Node, Edge } from '@xyflow/react';
import type { AspireNodeData } from '../components/playground/AspireNode';

export interface GeneratedCode {
  appHost: string;
  nugetPackages: string[];
  deploymentOptions: string[];
}

export function generateAppHostCode(nodes: Node<AspireNodeData>[], edges: Edge[]): GeneratedCode {
  const nugetPackages = new Set<string>();
  const resourceDeclarations: string[] = [];
  const references = new Map<string, string[]>();

  // Build reference graph
  edges.forEach(edge => {
    if (!references.has(edge.source)) {
      references.set(edge.source, []);
    }
    references.get(edge.source)!.push(edge.target);
  });

  // Sort nodes by dependencies (topological sort)
  const sortedNodes = topologicalSort(nodes, edges);

  // Generate resource declarations
  sortedNodes.forEach(node => {
    const { resourceType, instanceName, databaseName } = node.data;
    
    // Skip if no instance name
    if (!instanceName) return;

    let code = '';
    
    switch (resourceType) {
      // Projects
      case 'dotnet-project':
        code = `var ${instanceName} = builder.AddProject<Projects.${capitalize(instanceName)}>("${instanceName}")`;
        break;
        
      case 'node-app':
        code = `var ${instanceName} = builder.AddNodeApp("${instanceName}", "../${instanceName}")`;
        nugetPackages.add('Aspire.Hosting.NodeJs');
        break;
        
      case 'vite-app':
        code = `var ${instanceName} = builder.AddViteApp("${instanceName}", "../${instanceName}")\n    .WithHttpEndpoint(env: "PORT")`;
        nugetPackages.add('Aspire.Hosting.NodeJs');
        break;
        
      case 'python-app':
        code = `var ${instanceName} = builder.AddPythonApp("${instanceName}", "../${instanceName}", "main.py")`;
        nugetPackages.add('Aspire.Hosting.Python');
        break;
        
      case 'container':
        code = `var ${instanceName} = builder.AddContainer("${instanceName}", "myregistry/${instanceName}", "latest")\n    .WithHttpEndpoint(targetPort: 8080)`;
        break;

      // Databases
      case 'postgres':
        code = `var ${instanceName} = builder.AddPostgres("${instanceName}")\n    .WithLifetime(ContainerLifetime.Persistent)`;
        if (databaseName) {
          code += `;\nvar ${databaseName} = ${instanceName}.AddDatabase("${databaseName}")`;
        }
        nugetPackages.add('Aspire.Hosting.PostgreSQL');
        break;
        
      case 'sqlserver':
        code = `var ${instanceName} = builder.AddSqlServer("${instanceName}")\n    .WithLifetime(ContainerLifetime.Persistent)`;
        if (databaseName) {
          code += `;\nvar ${databaseName} = ${instanceName}.AddDatabase("${databaseName}")`;
        }
        nugetPackages.add('Aspire.Hosting.SqlServer');
        break;
        
      case 'mongodb':
        code = `var ${instanceName} = builder.AddMongoDB("${instanceName}")\n    .WithLifetime(ContainerLifetime.Persistent)`;
        if (databaseName) {
          code += `;\nvar ${databaseName} = ${instanceName}.AddDatabase("${databaseName}")`;
        }
        nugetPackages.add('Aspire.Hosting.MongoDB');
        break;
        
      case 'mysql':
        code = `var ${instanceName} = builder.AddMySql("${instanceName}")\n    .WithLifetime(ContainerLifetime.Persistent)`;
        if (databaseName) {
          code += `;\nvar ${databaseName} = ${instanceName}.AddDatabase("${databaseName}")`;
        }
        nugetPackages.add('Aspire.Hosting.MySql');
        break;
        
      case 'oracle':
        code = `var ${instanceName} = builder.AddOracle("${instanceName}")\n    .WithLifetime(ContainerLifetime.Persistent)`;
        if (databaseName) {
          code += `;\nvar ${databaseName} = ${instanceName}.AddDatabase("${databaseName}")`;
        }
        nugetPackages.add('Aspire.Hosting.Oracle');
        break;

      // Cache
      case 'redis':
        code = `var ${instanceName} = builder.AddRedis("${instanceName}")`;
        nugetPackages.add('Aspire.Hosting.Redis');
        break;
        
      case 'valkey':
        code = `var ${instanceName} = builder.AddValkey("${instanceName}")`;
        nugetPackages.add('Aspire.Hosting.Valkey');
        break;
        
      case 'garnet':
        code = `var ${instanceName} = builder.AddGarnet("${instanceName}")`;
        nugetPackages.add('Aspire.Hosting.Garnet');
        break;

      // Messaging
      case 'rabbitmq':
        code = `var ${instanceName} = builder.AddRabbitMQ("${instanceName}")`;
        nugetPackages.add('Aspire.Hosting.RabbitMQ');
        break;
        
      case 'kafka':
        code = `var ${instanceName} = builder.AddKafka("${instanceName}")`;
        nugetPackages.add('Aspire.Hosting.Kafka');
        break;
        
      case 'nats':
        code = `var ${instanceName} = builder.AddNats("${instanceName}")`;
        nugetPackages.add('Aspire.Hosting.Nats');
        break;

      // AI
      case 'openai':
        code = `var ${instanceName} = builder.AddConnectionString("${instanceName}")`;
        break;
        
      case 'ollama':
        code = `var ${instanceName} = builder.AddOllama("${instanceName}")`;
        nugetPackages.add('Aspire.Hosting.Ollama');
        break;
    }

    // Add references if this node has dependencies
    const deps = edges.filter(e => e.target === node.id);
    if (deps.length > 0 && code) {
      const sourceNodes = deps.map(dep => nodes.find(n => n.id === dep.source)).filter(Boolean);
      sourceNodes.forEach(sourceNode => {
        const sourceName = sourceNode!.data.databaseName || sourceNode!.data.instanceName;
        if (sourceName) {
          code += `\n    .WithReference(${sourceName})`;
        }
      });
      
      // Add WaitFor for database dependencies
      const dbDeps = sourceNodes.filter(n => 
        ['postgres', 'sqlserver', 'mongodb', 'mysql', 'oracle'].includes(n!.data.resourceType)
      );
      if (dbDeps.length > 0) {
        dbDeps.forEach(dbNode => {
          const dbName = dbNode!.data.databaseName || dbNode!.data.instanceName;
          if (dbName) {
            code += `\n    .WaitFor(${dbName})`;
          }
        });
      }
    }

    if (code) {
      resourceDeclarations.push(code + ';');
    }
  });

  const appHost = `var builder = DistributedApplication.CreateBuilder(args);

${resourceDeclarations.join('\n\n')}

builder.Build().Run();`;

  const deploymentOptions = [
    'aspire run',
    'aspire deploy --output-path ./deploy',
    'aspire deploy --format docker-compose',
    'aspire deploy --format kubernetes',
  ];

  return {
    appHost,
    nugetPackages: Array.from(nugetPackages),
    deploymentOptions,
  };
}

function topologicalSort(nodes: Node<AspireNodeData>[], edges: Edge[]): Node<AspireNodeData>[] {
  const graph = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  // Initialize
  nodes.forEach(node => {
    graph.set(node.id, []);
    inDegree.set(node.id, 0);
  });

  // Build graph
  edges.forEach(edge => {
    graph.get(edge.source)!.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  });

  // Kahn's algorithm
  const queue: string[] = [];
  const result: Node<AspireNodeData>[] = [];

  // Find nodes with no dependencies
  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) {
      queue.push(nodeId);
    }
  });

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      result.push(node);
    }

    graph.get(nodeId)!.forEach(neighbor => {
      const newDegree = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    });
  }

  return result;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
