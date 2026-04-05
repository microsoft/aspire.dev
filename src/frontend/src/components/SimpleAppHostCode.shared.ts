import type { MarkerDefinition } from '@astrojs/starlight/expressive-code';

export type MarkerValueType = MarkerDefinition | MarkerDefinition[] | undefined;
export type CollapseValueType = string | string[] | undefined;
export type LangType = 'csharp' | 'python' | 'nodejs' | 'go' | 'java';

export const typescriptLineOffset = 2;

function shiftLine(line: number, offset: number): number {
  return line + offset;
}

function shiftRange(value: string, offset: number): string {
  const [startText, endText] = value.split('-');
  const start = Number.parseInt(startText, 10);

  if (Number.isNaN(start)) {
    return value;
  }

  const end = endText === undefined ? start : Number.parseInt(endText, 10);

  if (Number.isNaN(end)) {
    return value;
  }

  const shiftedStart = shiftLine(start, offset);
  const shiftedEnd = shiftLine(end, offset);

  return shiftedStart === shiftedEnd ? `${shiftedStart}` : `${shiftedStart}-${shiftedEnd}`;
}

export function shiftMarkerValue(value: MarkerValueType, offset: number): MarkerValueType {
  if (value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => shiftMarkerValue(item, offset) as MarkerDefinition);
  }

  if (typeof value === 'number') {
    return shiftLine(value, offset);
  }

  if (typeof value === 'string') {
    return shiftRange(value, offset);
  }

  if (typeof value === 'object' && value !== null && 'range' in value) {
    const marker = value as Record<string, unknown> & { range?: string | number };

    if (typeof marker.range === 'number') {
      return { ...marker, range: `${shiftLine(marker.range, offset)}` } as MarkerDefinition;
    }

    if (typeof marker.range === 'string') {
      return { ...marker, range: shiftRange(marker.range, offset) } as MarkerDefinition;
    }
  }

  return value;
}

export function shiftCollapseValue(value: CollapseValueType, offset: number): CollapseValueType {
  if (value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => shiftRange(item, offset));
  }

  return shiftRange(value, offset);
}

const csharp = `
var builder = DistributedApplication.CreateBuilder(args);

// Add database resource
var postgres = builder.AddPostgres("db")
    .AddDatabase("appdata")
    .WithDataVolume();

// Add API service and reference the database
var api = builder.AddProject<Projects.Api>("api")
    .WithReference(postgres)
    .WaitFor(postgres);

// Add frontend service and reference the API
builder.AddViteApp("frontend", "../frontend")
    .WithHttpEndpoint(env: "PORT")
    .WithReference(api);

builder.Build().Run();
`;

const python = `
var builder = DistributedApplication.CreateBuilder(args);

// Add database resource
var postgres = builder.AddPostgres("db")
    .AddDatabase("appdata")
    .WithDataVolume();

// Add API service and reference the database
var api = builder.AddUvicornApp("api", "../api", "main:app")
    .WithUv()
    .WithReference(postgres)
    .WaitFor(postgres);

// Add frontend service and reference the API
builder.AddViteApp("frontend", "../frontend")
    .WithHttpEndpoint(env: "PORT")
    .WithReference(api);

builder.Build().Run();
`;

const javascript = `
var builder = DistributedApplication.CreateBuilder(args);

// Add database resource
var postgres = builder.AddPostgres("db")
    .AddDatabase("appdata")
    .WithDataVolume();

// Add API service and reference the database
var api = builder.AddNodeApp("api", "../api", "server.js")
    .WithNpm()
    .WithReference(postgres)
    .WaitFor(postgres);

// Add frontend service and reference the API
builder.AddViteApp("frontend", "../frontend")
    .WithHttpEndpoint(env: "PORT")
    .WithReference(api);

builder.Build().Run();
`;

const golang = `
var builder = DistributedApplication.CreateBuilder(args);

// Add database resource
var postgres = builder.AddPostgres("db")
    .AddDatabase("appdata")
    .WithDataVolume();

// Add API service and reference the database
var api = builder.AddGolangApp("api", "../api")
    .WithHttpEndpoint(env: "PORT")
    .WithReference(postgres)
    .WaitFor(postgres);

// Add frontend service and reference the API
builder.AddViteApp("frontend", "../frontend")
    .WithHttpEndpoint(env: "PORT")
    .WithReference(api);

builder.Build().Run();
`;

const java = `
var builder = DistributedApplication.CreateBuilder(args);

// Add database resource
var postgres = builder.AddPostgres("db")
    .AddDatabase("appdata")
    .WithDataVolume();

// Add API service and reference the database
var api = builder.AddSpringApp("api", "../api", "otel.jar")
    .WithHttpEndpoint(port: 8080)
    .WithReference(postgres)
    .WaitFor(postgres);

// Add frontend service and reference the API
builder.AddViteApp("frontend", "../frontend")
    .WithHttpEndpoint(env: "PORT")
    .WithReference(api);

builder.Build().Run();
`;

const csharpTypeScript = `
import { createBuilder } from './.modules/aspire.js';

const builder = await createBuilder();

// Add database resource
const postgres = await builder.addPostgres("db")
    .addDatabase("appdata")
    .withDataVolume();

// Add API service and reference the database
const api = await builder.addProject("api", "../api/Api.csproj", "https")
    .withReference(postgres)
    .waitFor(postgres);

// Add frontend service and reference the API
await builder.addViteApp("frontend", "../frontend")
    .withHttpEndpoint({ env: "PORT" })
    .withReference(api);

await builder.build().run();
`;

const pythonTypeScript = `
import { createBuilder } from './.modules/aspire.js';

const builder = await createBuilder();

// Add database resource
const postgres = await builder.addPostgres("db")
    .addDatabase("appdata")
    .withDataVolume();

// Add API service and reference the database
const api = await builder.addUvicornApp("api", "../api", "main:app")
    .withUv()
    .withReference(postgres)
    .waitFor(postgres);

// Add frontend service and reference the API
await builder.addViteApp("frontend", "../frontend")
    .withHttpEndpoint({ env: "PORT" })
    .withReference(api);

await builder.build().run();
`;

const nodejsTypeScript = `
import { createBuilder } from './.modules/aspire.js';

const builder = await createBuilder();

// Add database resource
const postgres = await builder.addPostgres("db")
    .addDatabase("appdata")
    .withDataVolume();

// Add API service and reference the database
const api = await builder.addNodeApp("api", "../api", "server.js")
    .withNpm()
    .withReference(postgres)
    .waitFor(postgres);

// Add frontend service and reference the API
await builder.addViteApp("frontend", "../frontend")
    .withHttpEndpoint({ env: "PORT" })
    .withReference(api);

await builder.build().run();
`;

const csharpCodeMap: Record<LangType, string> = {
  csharp,
  python,
  nodejs: javascript,
  go: golang,
  java,
};

const typescriptCodeMap: Partial<Record<LangType, string>> = {
  csharp: csharpTypeScript,
  python: pythonTypeScript,
  nodejs: nodejsTypeScript,
};

export function getSimpleAppHostCode(lang: LangType): {
  csharpCode: string;
  typescriptCode?: string;
} {
  return {
    csharpCode: csharpCodeMap[lang],
    typescriptCode: typescriptCodeMap[lang],
  };
}
