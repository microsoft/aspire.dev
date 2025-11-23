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

        // Sanitize variable names for C#
        const sanitizedInstanceName = sanitizeCSharpIdentifier(instanceName);
        const sanitizedDatabaseName = databaseName ? sanitizeCSharpIdentifier(databaseName) : null;

        let code = '';

        switch (resourceType) {
            // Projects
            case 'dotnet-project':
                code = `var ${sanitizedInstanceName} = builder.AddProject<Projects.${capitalize(sanitizedInstanceName)}>("${instanceName}")`;
                break;

            case 'node-app':
                code = `var ${sanitizedInstanceName} = builder.AddNodeApp("${instanceName}", "../${instanceName}")`;
                nugetPackages.add('Aspire.Hosting.NodeJs@13.0.0');
                break;

            case 'vite-app':
                code = `var ${sanitizedInstanceName} = builder.AddViteApp("${instanceName}", "../${instanceName}")\n    .WithHttpEndpoint(env: "PORT")`;
                nugetPackages.add('Aspire.Hosting.NodeJs@13.0.0');
                break;

            case 'python-app':
                code = `var ${sanitizedInstanceName} = builder.AddPythonApp("${instanceName}", "../${instanceName}", "main.py")`;
                nugetPackages.add('Aspire.Hosting.Python@13.0.0');
                break;

            case 'container':
                code = `var ${sanitizedInstanceName} = builder.AddContainer("${instanceName}", "myregistry/${instanceName}", "latest")\n    .WithHttpEndpoint(targetPort: 8080)`;
                break;

            // Databases
            case 'postgres':
                code = `var ${sanitizedInstanceName} = builder.AddPostgres("${instanceName}")\n    .WithLifetime(ContainerLifetime.Persistent)`;
                if (sanitizedDatabaseName) {
                    code += `;\nvar ${sanitizedDatabaseName} = ${sanitizedInstanceName}.AddDatabase("${databaseName}")`;
                }
                nugetPackages.add('Aspire.Hosting.PostgreSQL@13.0.0');
                break;

            case 'sqlserver':
                code = `var ${sanitizedInstanceName} = builder.AddSqlServer("${instanceName}")\n    .WithLifetime(ContainerLifetime.Persistent)`;
                if (sanitizedDatabaseName) {
                    code += `;\nvar ${sanitizedDatabaseName} = ${sanitizedInstanceName}.AddDatabase("${databaseName}")`;
                }
                nugetPackages.add('Aspire.Hosting.SqlServer@13.0.0');
                break;

            case 'mongodb':
                code = `var ${sanitizedInstanceName} = builder.AddMongoDB("${instanceName}")\n    .WithLifetime(ContainerLifetime.Persistent)`;
                if (sanitizedDatabaseName) {
                    code += `;\nvar ${sanitizedDatabaseName} = ${sanitizedInstanceName}.AddDatabase("${databaseName}")`;
                }
                nugetPackages.add('Aspire.Hosting.MongoDB@13.0.0');
                break;

            case 'mysql':
                code = `var ${sanitizedInstanceName} = builder.AddMySql("${instanceName}")\n    .WithLifetime(ContainerLifetime.Persistent)`;
                if (sanitizedDatabaseName) {
                    code += `;\nvar ${sanitizedDatabaseName} = ${sanitizedInstanceName}.AddDatabase("${databaseName}")`;
                }
                nugetPackages.add('Aspire.Hosting.MySql@13.0.0');
                break;

            case 'oracle':
                code = `var ${sanitizedInstanceName} = builder.AddOracle("${instanceName}")\n    .WithLifetime(ContainerLifetime.Persistent)`;
                if (sanitizedDatabaseName) {
                    code += `;\nvar ${sanitizedDatabaseName} = ${sanitizedInstanceName}.AddDatabase("${databaseName}")`;
                }
                nugetPackages.add('Aspire.Hosting.Oracle@13.0.0');
                break;

            // Cache
            case 'redis':
                code = `var ${sanitizedInstanceName} = builder.AddRedis("${instanceName}")`;
                nugetPackages.add('Aspire.Hosting.Redis@13.0.0');
                break;

            case 'valkey':
                code = `var ${sanitizedInstanceName} = builder.AddValkey("${instanceName}")`;
                nugetPackages.add('Aspire.Hosting.Valkey@13.0.0');
                break;

            case 'garnet':
                code = `var ${sanitizedInstanceName} = builder.AddGarnet("${instanceName}")`;
                nugetPackages.add('Aspire.Hosting.Garnet@13.0.0');
                break;

            // Messaging
            case 'rabbitmq':
                code = `var ${sanitizedInstanceName} = builder.AddRabbitMQ("${instanceName}")`;
                nugetPackages.add('Aspire.Hosting.RabbitMQ@13.0.0');
                break;

            case 'kafka':
                code = `var ${sanitizedInstanceName} = builder.AddKafka("${instanceName}")`;
                nugetPackages.add('Aspire.Hosting.Kafka@13.0.0');
                break;

            case 'nats':
                code = `var ${sanitizedInstanceName} = builder.AddNats("${instanceName}")`;
                nugetPackages.add('Aspire.Hosting.Nats@13.0.0');
                break;

            // AI
            case 'openai':
                code = `var ${sanitizedInstanceName} = builder.AddConnectionString("${instanceName}")`;
                break;

            case 'ollama':
                code = `var ${sanitizedInstanceName} = builder.AddOllama("${instanceName}")`;
                nugetPackages.add('Aspire.Hosting.Ollama@13.0.0');
                break;
        }

        // Add references if this node has dependencies
        const deps = edges.filter(e => e.target === node.id);
        if (deps.length > 0 && code) {
            const sourceNodes = deps.map(dep => nodes.find(n => n.id === dep.source)).filter(Boolean);
            sourceNodes.forEach(sourceNode => {
                const sourceName = sourceNode!.data.databaseName || sourceNode!.data.instanceName;
                if (sourceName) {
                    const sanitizedSourceName = sanitizeCSharpIdentifier(sourceName);
                    code += `\n    .WithReference(${sanitizedSourceName})`;
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
                        const sanitizedDbName = sanitizeCSharpIdentifier(dbName);
                        code += `\n    .WaitFor(${sanitizedDbName})`;
                    }
                });
            }
        }

        if (code) {
            resourceDeclarations.push(code + ';');
        }
    });

    // Build the header with SDK and package directives
    const packageDirectives = Array.from(nugetPackages)
        .sort()
        .map(pkg => `#:package ${pkg}`)
        .join('\n');

    const header = packageDirectives 
        ? `#:sdk Aspire.AppHost.Sdk@13.0.0\n${packageDirectives}\n`
        : `#:sdk Aspire.AppHost.Sdk@13.0.0\n`;

    const appHost = `${header}
var builder = DistributedApplication.CreateBuilder(args);

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

function sanitizeCSharpIdentifier(name: string): string {
    // Replace invalid characters with underscores
    let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
    
    // Ensure it doesn't start with a digit
    if (/^[0-9]/.test(sanitized)) {
        sanitized = '_' + sanitized;
    }
    
    // If empty or only underscores, provide a default
    if (!sanitized || /^_+$/.test(sanitized)) {
        sanitized = 'resource';
    }
    
    return sanitized;
}
