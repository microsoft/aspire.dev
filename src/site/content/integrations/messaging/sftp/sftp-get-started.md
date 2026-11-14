---
title: Get started with the SFTP integration
description: Run an SFTP server in an Aspire AppHost and connect to it with the Community Toolkit SSH.NET client integration.
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

The Community Toolkit SFTP integrations provide an [atmoz SFTP](https://github.com/atmoz/sftp) container resource and a .NET client based on [SSH.NET](https://github.com/sshnet/SSH.NET). Use the host integration to configure an SFTP server and the client integration to register `SftpClient` in a consuming app.

## Prerequisites

- An Aspire AppHost project
- An SFTP username and password or an SSH public/private key pair

## Add an SFTP server

Install [📦 CommunityToolkit.Aspire.Hosting.Sftp](https://www.nuget.org/packages/CommunityToolkit.Aspire.Hosting.Sftp) in the AppHost. Configure users with a file named `users.conf`:

```text title="users.conf"
fileuser:__PASSWORD_HASH__:e:::uploads
```

The user-file format is `username:password[:e[:uid[:gid[:dir1[,dir2]...]]]]`. The `e` marker identifies an encrypted password. See [Set up the SFTP resource](../sftp-host/) for key-based access and host key configuration.

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```bash title="Terminal"
aspire add CommunityToolkit.Aspire.Hosting.Sftp
```

```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();
const sftp = await builder.addSftp('sftp');
await sftp.withUsersFile('./users.conf');

const worker = await builder.addProject('worker', '../Worker/Worker.csproj');
await worker.withReference(sftp);

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```bash title="Terminal"
aspire add CommunityToolkit.Aspire.Hosting.Sftp
```

```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);
var sftp = builder.AddSftp("sftp")
    .WithUsersFile("users.conf");

builder.AddProject<Projects.Worker>("worker")
    .WithReference(sftp);

// After adding all resources, run the app...
builder.Build().Run();
```
{% endtab %}
{% endtabs %}

## Connect from a .NET app

Install [📦 CommunityToolkit.Aspire.Sftp](https://www.nuget.org/packages/CommunityToolkit.Aspire.Sftp) in the consuming project and register a client with the same connection name:

```csharp title="Program.cs"
builder.AddSftpClient(
    "sftp",
    settings =>
    {
        settings.Username = "fileuser";
        settings.Password = builder.Configuration["Sftp:Password"];
    });
```

For the configuration options, authentication methods, and file transfer example, see [Connect to an SFTP server](../sftp-connect/).

## See also

- [Set up the SFTP resource](../sftp-host/)
- [Connect to an SFTP server](../sftp-connect/)
- [SSH.NET documentation](https://github.com/sshnet/SSH.NET)
- [CommunityToolkit.Aspire source and tests](https://github.com/CommunityToolkit/Aspire/tree/main/src/CommunityToolkit.Aspire.Hosting.Sftp)
