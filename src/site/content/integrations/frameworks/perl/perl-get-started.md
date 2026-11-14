---
title: Get started with the Perl hosting integration
category: quickstart
description: Run Perl scripts, APIs, modules, and executables in Aspire with local dependencies, dashboard visibility, and container publishing.
---

{% badge "⭐ Community Toolkit", variant: "tip", size: "large" %}

{% image "/assets/images/icons/perl-096-1500.svg", alt: "Perl Camel", width: 75, height: 75, fit: "contain", class: "float-inline-left icon", zoomable: false %}

The Aspire Community Toolkit Perl hosting integration runs Perl applications alongside the other resources in your AppHost. It models a Perl process as a first-class resource, manages its working directory and dependency installers, and supports local development and Dockerfile-based publishing.

## How the integration fits together

The hosting package belongs in the AppHost. It creates an executable resource for your Perl application, while your project retains its scripts, modules, and dependency files.

```mermaid
architecture-beta

  group apphost(server)[AppHost]
  group perl(logos:perl)[Perl project]

  service hosting(server)[Perl hosting integration] in apphost
  service resource(logos:perl)[Perl app resource] in apphost
  service runtime(logos:perl)[Perl runtime] in perl
  service app(logos:perl)[Perl application] in perl

  hosting:R --> L:resource
  resource:R --> L:runtime
  runtime:R --> L:app
```

## Prerequisites

- Install [Perl](https://www.perl.org/get.html) and ensure `perl` and `cpan` are on `PATH`.
- Install `cpanm` when you use {% api "Aspire.Hosting.PerlAppResourceBuilderExtensions.WithCpanMinus" %}, {% api "Aspire.Hosting.PerlAppResourceBuilderExtensions.WithLocalLib" %}, or project dependency installation without Carton. Install `carton` when you use Carton.
- Install the [Aspire CLI](/get-started/install-cli/) and create an AppHost.

:::note
Perlbrew support is Linux-only. On Windows, use a supported Perl distribution; configuring perlbrew causes the resource to fail before it starts.
:::

## Setup

### Add the hosting package

Add `CommunityToolkit.Aspire.Hosting.Perl` to your AppHost. The [Perl hosting reference](/integrations/frameworks/perl/perl-host/#installation) includes package installation options.

### Add a Perl resource

Add a script resource and use a project-local module directory:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript title="apphost.mts"
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const worker = await builder.addPerlScript(
  'worker',
  '../perl-worker',
  'worker.pl'
);
await worker.withLocalLib('local');

await builder.build().run();
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="AppHost.cs"
var builder = DistributedApplication.CreateBuilder(args);

builder.AddPerlScript("worker", "../perl-worker", "worker.pl")
    .WithLocalLib("local");

builder.Build().Run();
```
{% endtab %}
{% endtabs %}

### Configure dependencies and endpoints

The resource's application directory is its working directory. Put a `cpanfile` there when you want Aspire to install project dependencies, and add an HTTP endpoint for a web API that listens on a port.

{% linkbutton "/integrations/frameworks/perl/perl-host/", variant: "secondary", icon_placement: "end", icon: "right-arrow" %}
Set up Perl in the AppHost
{% endlinkbutton %}

## See also

- [Perl documentation](https://perldoc.perl.org/)
- [Perl hosting reference](/integrations/frameworks/perl/perl-host/)
- [Aspire Community Toolkit](https://github.com/CommunityToolkit/Aspire)
