---
title: Set up MySQL in the AppHost
seoTitle: "Set up MySQL in the Aspire AppHost: hosting integration"
description: Learn how to use the Aspire MySQL Hosting integration to orchestrate and configure a MySQL database in an Aspire solution.
---

{% image "/assets/images/icons/mysqlconnector-icon.png", alt: "MySQL logo", width: 100, height: 100, class: "float-inline-left icon", zoomable: false %}

This article is the reference for the Aspire MySQL Hosting integration. It enumerates the AppHost APIs — with examples for both `AppHost.cs` and `apphost.mts` — that you use to model MySQL server and database resources in your [`AppHost`](/get-started/app-host/) project.

If you're new to the MySQL integration, start with the [Get started with MySQL integrations](/integrations/databases/mysql/mysql-get-started/) guide. For how consuming apps read the connection information this page exposes, see [Connect to MySQL](../mysql-connect/). For the MySQL Entity Framework Core (EF Core) client integration, see [Get started with the MySQL Entity Framework Core integrations](/integrations/databases/efcore/mysql/mysql-get-started/).

## Installation

To start building an Aspire app that uses MySQL, install the [📦 Aspire.Hosting.MySql](https://www.nuget.org/packages/Aspire.Hosting.MySql) NuGet package:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```bash title="Terminal"
aspire add mysql
```

{% learnmore %}
Learn more about [`aspire add`](/reference/cli/commands/aspire-add/) in the command reference.
{% endlearnmore %}

This updates your `aspire.config.json` with the MySQL hosting integration package:

```json title="aspire.config.json" ins={3}
{
  "packages": {
    "Aspire.Hosting.MySql": "%ASPIRE_VERSION%"
  }
}
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```bash title="Terminal"
aspire add mysql
```

{% learnmore %}
Learn more about [`aspire add`](/reference/cli/commands/aspire-add/) in the command reference.
{% endlearnmore %}

Or, choose a manual installation approach:

```csharp title="AppHost.cs"
#:package Aspire.Hosting.MySql@*
```

```xml title="AppHost.csproj"
<PackageReference Include="Aspire.Hosting.MySql" Version="*" />
```
{% endtab %}
{% endtabs %}

## Add MySQL server resource

Once you've installed the hosting integration in your AppHost project, you can add a MySQL server resource and then add a database resource as shown in the following examples:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { ContainerLifetime, createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const mysql = await builder.addMySql("mysql");
await mysql.withLifetime(ContainerLifetime.Persistent);

const mysqldb = await mysql.addDatabase("mysqldb");

await builder.addNodeApp("api", "./api", "index.js")
    .withReference(mysqldb)
    .waitFor(mysqldb);

// After adding all resources, run the app...
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var mysql = builder.AddMySql("mysql")
    .WithLifetime(ContainerLifetime.Persistent);

var mysqldb = mysql.AddDatabase("mysqldb");

var exampleProject = builder.AddProject<Projects.ExampleProject>("apiservice")
    .WithReference(mysqldb)
    .WaitFor(mysqldb);

// After adding all resources, run the app...
```
{% endtab %}
{% endtabs %}

{% steps %}
1. When Aspire adds a container image to the AppHost, as shown in the preceding example with the `docker.io/library/mysql` image, it creates a new MySQL server instance on your local machine. A reference to the `mysqldb` database resource is used to add a dependency to the consuming project.

1. The MySQL server resource includes default credentials with a `username` of `root` and a randomly generated `password` using the `CreateDefaultPasswordParameter` method.

1. The AppHost reference call configures a connection in the consuming project named after the referenced database resource, such as `mysqldb` in the preceding example.
{% endsteps %}

:::note
The MySQL container can be slow to start, so it's best to use a _persistent_ lifetime to avoid unnecessary restarts. For more information, see [Container resource lifetime](/architecture/resource-model/#built-in-resources-and-lifecycle).
:::

:::note
When you reference a MySQL resource from the AppHost, Aspire makes several properties available to the consuming project, such as connection URIs, hostnames, port numbers, and the password. For a complete list of these properties and per-language connection examples, see [Connect to MySQL](../mysql-connect/).
:::

{% container_images package: "Aspire.Hosting.MySql", only: "MySQL" %}

## Add MySQL resource with database scripts

You can use the {% api "Aspire.Hosting.MySqlBuilderExtensions.WithCreationScript" %} method to execute SQL scripts when the database is created. This is useful for initializing database schema or seeding data:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { ContainerLifetime, createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const mysql = await builder.addMySql("mysql");
await mysql.withLifetime(ContainerLifetime.Persistent);

const mysqldb = await mysql.addDatabase("mysqldb")
    .withCreationScript(`
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL
        );
        `);

const myService = await builder.addProject("example", "../ExampleProject/ExampleProject.csproj");
await myService
    .withReference(mysqldb)
    .waitFor(mysqldb);

// After adding all resources, run the app...
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var mysql = builder.AddMySql("mysql")
    .WithLifetime(ContainerLifetime.Persistent);

var mysqldb = mysql.AddDatabase("mysqldb")
    .WithCreationScript("""
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL
        );
        """);

var myService = builder.AddProject<Projects.ExampleProject>()
    .WithReference(mysqldb)
    .WaitFor(mysqldb);

// After adding all resources, run the app...
```
{% endtab %}
{% endtabs %}

:::note
The script is executed only when the database is first created. If you need to run scripts on every startup, consider using init files or application-level migrations instead.
:::

## Add MySQL resource with phpMyAdmin

[**phpMyAdmin**](https://www.phpmyadmin.net/) is a popular web-based administration tool for MySQL. Call the {% api "Aspire.Hosting.MySqlBuilderExtensions.WithPhpMyAdmin" %} method to add a phpMyAdmin container resource that connects to the MySQL container:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const mysql = await builder.addMySql("mysql");
await mysql.withPhpMyAdmin();

const mysqldb = await mysql.addDatabase("mysqldb");

await builder.addNodeApp("api", "./api", "index.js")
    .withReference(mysqldb)
    .waitFor(mysqldb);

// After adding all resources, run the app...
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var mysql = builder.AddMySql("mysql")
    .WithPhpMyAdmin();

var mysqldb = mysql.AddDatabase("mysqldb");

var myService = builder.AddProject<Projects.ExampleProject>()
    .WithReference(mysqldb)
    .WaitFor(mysqldb);

// After adding all resources, run the app...
```
{% endtab %}
{% endtabs %}

When you run the solution, the Aspire dashboard displays the phpMyAdmin resource with an endpoint. Select the endpoint link to open phpMyAdmin in a new browser tab.

{% container_images package: "Aspire.Hosting.MySql", only: "phpMyAdmin" %}

### Configure the phpMyAdmin container name

To set a custom container name for the phpMyAdmin resource in TypeScript:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const mysql = await builder.addMySql("mysql");
await mysql.withPhpMyAdmin({
    containerName: "phpmyadmin",
    configureContainer: async phpMyAdmin => {
        await phpMyAdmin.withHostPort(8080);
    }
});

const mysqldb = await mysql.addDatabase("mysqldb");

await builder.addNodeApp("api", "./api", "index.js")
    .withReference(mysqldb)
    .waitFor(mysqldb);

// After adding all resources, run the app...
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var mysql = builder.AddMySql("mysql")
    .WithPhpMyAdmin(phpMyAdmin => phpMyAdmin.WithHostPort(8080));

var mysqldb = mysql.AddDatabase("mysqldb");

var myService = builder.AddProject<Projects.ExampleProject>()
    .WithReference(mysqldb)
    .WaitFor(mysqldb);

// After adding all resources, run the app...
```
{% endtab %}
{% endtabs %}

## Add a MySQL resource with a data volume

Add a data volume to the MySQL server resource as shown in the following examples:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const mysql = await builder.addMySql("mysql");
await mysql.withDataVolume({ isReadOnly: false });

const mysqldb = await mysql.addDatabase("mysqldb");

await builder.addNodeApp("api", "./api", "index.js")
    .withReference(mysqldb)
    .waitFor(mysqldb);

// After adding all resources, run the app...
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var mysql = builder.AddMySql("mysql")
    .WithDataVolume(isReadOnly: false);

var mysqldb = mysql.AddDatabase("mysqldb");

var myService = builder.AddProject<Projects.ExampleProject>()
    .WithReference(mysqldb)
    .WaitFor(mysqldb);

// After adding all resources, run the app...
```
{% endtab %}
{% endtabs %}

The data volume is used to persist the MySQL server data outside the lifecycle of its container. The data volume is mounted at the `/var/lib/mysql` path in the MySQL container and when a `name` parameter isn't provided, the name is generated at random. For more information on data volumes and details on why they're preferred over [bind mounts](#add-a-mysql-resource-with-a-data-bind-mount), see [Docker docs: Volumes](https://docs.docker.com/engine/storage/volumes).

:::caution
The password is stored in the data volume. When using a data volume and if the password changes, it will not work until you delete the volume.
:::

:::danger
Some database integrations, including the MySQL integration, can't successfully use data volumes after deployment to Azure Container Apps (ACA). This is because ACA uses Server Message Block (SMB) to connect containers to data volumes, and some systems can't use this connection. In the Aspire Dashboard, a database affected by this issue has a status of **Activating** or **Activation Failed** but is never listed as **Running**.

You can resolve the problem by deploying to a Kubernetes cluster, such as Azure Kubernetes Services (AKS). For more information, see [Deploy your first Aspire app](/get-started/deploy-first-app/).
:::

## Add a MySQL resource with a data bind mount

Add a data bind mount to the MySQL server resource as shown in the following examples:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const mysql = await builder.addMySql("mysql");
await mysql.withDataBindMount("/MySQL/Data", { isReadOnly: false });

const mysqldb = await mysql.addDatabase("mysqldb");

await builder.addNodeApp("api", "./api", "index.js")
    .withReference(mysqldb)
    .waitFor(mysqldb);

// After adding all resources, run the app...
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var mysql = builder.AddMySql("mysql")
    .WithDataBindMount(
        source: "/MySQL/Data",
        isReadOnly: false);

var mysqldb = mysql.AddDatabase("mysqldb");

var myService = builder.AddProject<Projects.ExampleProject>()
    .WithReference(mysqldb)
    .WaitFor(mysqldb);

// After adding all resources, run the app...
```
{% endtab %}
{% endtabs %}

:::note
Data [bind mounts](https://docs.docker.com/engine/storage/bind-mounts/) have limited functionality compared to [volumes](https://docs.docker.com/engine/storage/volumes/), which offer better performance, portability, and security, making them more suitable for production environments. However, bind mounts allow direct access and modification of files on the host system, ideal for development and testing where real-time changes are needed.
:::

Data bind mounts rely on the host machine's filesystem to persist the MySQL server data across container restarts. The data bind mount is mounted at the `C:\MySQL\Data` on Windows (or `/MySQL/Data` on Unix) path on the host machine in the MySQL server container. For more information on data bind mounts, see [Docker docs: Bind mounts](https://docs.docker.com/engine/storage/bind-mounts).

## Add MySQL resource with init files

Use initialization files to seed or configure the MySQL server at startup. Call `WithInitFiles(...)` in a C# AppHost or `withInitFiles(...)` in a TypeScript AppHost to copy the files from the specified directory into the container's initialization folder.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const mysql = await builder.addMySql("mysql");
await mysql.withInitFiles("./mysql-init");

const mysqldb = await mysql.addDatabase("mysqldb");

await builder.addNodeApp("api", "./api", "index.js")
    .withReference(mysqldb)
    .waitFor(mysqldb);

// After adding all resources, run the app...
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var mysql = builder.AddMySql("mysql")
    .WithInitFiles("./mysql-init");

var mysqldb = mysql.AddDatabase("mysqldb");

var myService = builder.AddProject<Projects.ExampleProject>()
    .WithReference(mysqldb)
    .WaitFor(mysqldb);

// After adding all resources, run the app...
```
{% endtab %}
{% endtabs %}

The init files are executed when the MySQL server container starts. Place executable shell scripts or `.sql` files in the directory to initialize the database schema, seed data, or perform other setup tasks.

## Add MySQL resource with parameters

When you want to provide a root MySQL password and optional port explicitly, you can pass them as parameters:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const password = await builder.addParameter("password", { secret: true });

const mysql = await builder.addMySql("mysql", { password, port: 3306 });
const mysqldb = await mysql.addDatabase("mysqldb");

await builder.addNodeApp("api", "./api", "index.js")
    .withReference(mysqldb)
    .waitFor(mysqldb);

// After adding all resources, run the app...
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var password = builder.AddParameter("password", secret: true);

var mysql = builder.AddMySql("mysql", password)
    .WithLifetime(ContainerLifetime.Persistent);

var mysqldb = mysql.AddDatabase("mysqldb");

var myService = builder.AddProject<Projects.ExampleProject>()
    .WithReference(mysqldb)
    .WaitFor(mysqldb);

// After adding all resources, run the app...
```
{% endtab %}
{% endtabs %}

When no `password` parameter is provided, Aspire generates a strong password automatically using the `CreateDefaultPasswordParameter` method. For more information, see [External parameters](/get-started/resources/).

## Pass custom environment variables

By default, Aspire injects the MySQL connection information using variable names derived from the resource name (for example, `MYSQLDB_URI`, `MYSQLDB_HOST`, `MYSQLDB_PORT`, `MYSQLDB_PASSWORD`). If your consuming app expects a different set of environment variable names, pass individual connection properties from the AppHost:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder, EndpointProperty } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const mysql = await builder.addMySql("mysql");
const mysqldb = await mysql.addDatabase("mysqldb");
const mysqlEndpoint = await mysql.getEndpoint("tcp");
const mysqlHost = await mysqlEndpoint.property(EndpointProperty.Host);
const mysqlPort = await mysqlEndpoint.property(EndpointProperty.Port);

await builder.addNodeApp("my-app", "./app", "index.js")
    .withReference(mysqldb)
    .withEnvironment("MYSQL_HOST", mysqlHost)
    .withEnvironment("MYSQL_PORT", mysqlPort)
    .withEnvironment("MYSQL_PASSWORD", await mysql.passwordParameter())
    .withEnvironment("MYSQL_DATABASE", "mysqldb");

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

var mysql = builder.AddMySql("mysql");
var mysqldb = mysql.AddDatabase("mysqldb");

var app = builder.AddExecutable("my-app", "node", "app.js", ".")
    .WithReference(mysqldb)
    .WithEnvironment(context =>
    {
        context.EnvironmentVariables["MYSQL_HOST"] = mysql.Resource.PrimaryEndpoint.Property(EndpointProperty.Host);
        context.EnvironmentVariables["MYSQL_PORT"] = mysql.Resource.PrimaryEndpoint.Property(EndpointProperty.Port);
        context.EnvironmentVariables["MYSQL_PASSWORD"] = mysql.Resource.PasswordParameter;
        context.EnvironmentVariables["MYSQL_DATABASE"] = mysqldb.Resource.DatabaseName;
    });

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

<span id="add-mysql-resource-with-a-repl-command"></span>

## Open an interactive REPL

In Aspire 13.6 or later, add {% api "Aspire.Hosting.MySqlBuilderExtensions.WithRepl" %} to the MySQL server resource to enable a **REPL** command that opens `mysql` in the [terminal dock](/dashboard/terminals/#use-the-terminal-dock).

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();
await builder.addMySql('mysql').withRepl();

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

builder.AddMySql("mysql").WithRepl();

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

The command is opt-in and available only in run mode while the container is running. It uses the container's bundled client through Docker or Podman, so no local MySQL client is needed. The client authenticates as `root`, with the configured password passed through an environment variable rather than command-line arguments or SQL history.

Use `quit` before closing the terminal tab. Closing the tab alone can leave the client running inside the container; stopping the container ends any remaining processes.

:::caution
The client uses the resource's configured credentials and can modify or delete data. Enable it only for trusted dashboard users, including anyone accessing the dashboard through a tunnel or remote development session.
:::

## Connection properties

For the full reference of MySQL connection properties — and how consuming apps in C#, TypeScript, Python, and Go read them — see [Connect to MySQL](../mysql-connect/).

## Hosting integration health checks

The MySQL hosting integration automatically adds a health check for the MySQL resource. The health check verifies that the MySQL server is running and that a connection can be established to it.

The hosting integration relies on the [📦 AspNetCore.HealthChecks.MySql](https://www.nuget.org/packages/AspNetCore.HealthChecks.MySql) NuGet package.
