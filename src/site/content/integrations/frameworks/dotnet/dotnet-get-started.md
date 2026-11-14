---
title: Get started with the .NET / C# app integration
description: Understand how the Aspire Dotnet hosting integration runs C# projects and file-based apps by path from your AppHost and how to choose the right setup path.
---

{% image light: "/assets/images/icons/csharp.svg", dark: "/assets/images/icons/csharp.svg", alt: "C# logo", width: 100, height: 100, zoomable: false, class: "float-inline-left icon" %}

The Aspire `Aspire.Hosting.Dotnet` integration lets you add C# projects and file-based C# apps to your AppHost **by path**, without referencing a project from the AppHost's own solution. It's the C# peer of the `Aspire.Hosting.Go`, `Aspire.Hosting.Python`, and `Aspire.Hosting.JavaScript` hosting integrations.

:::note
`Aspire.Hosting.Dotnet` is a prerelease package. Its APIs remain unstable and may change in future releases.

Starting with Aspire 13.6, {% api "Aspire.Hosting.DotnetProjectHostingExtensions.AddDotnetProject" %} no longer requires suppressing [`ASPIREDOTNETPROJECT001`](/diagnostics/aspiredotnetproject001/). You can remove existing suppressions for these APIs after upgrading.
:::

## Why use the Dotnet hosting integration

Adding C# apps by path through `Aspire.Hosting.Dotnet` gives you:

- **Path-based orchestration for C#.** Model a C# project or a file-based `.cs` app in the AppHost the same way you'd model a Go, Python, or JavaScript app added by path, without adding the project to the AppHost's solution.
- **File-based app support.** Add a single `.cs` file-based app (requires .NET 10 or later) directly, matching the file-based apps experience for `dotnet run --file`.
- **Familiar launch and configuration behavior.** Endpoints, environment variables, and service discovery are configured from the project's `launchSettings.json` and Kestrel configuration, matching {% api "Aspire.Hosting.ProjectResourceBuilderExtensions.AddProject" %}.

## How the pieces fit together

The Dotnet integration is a **hosting integration**. You install it in the AppHost and use `AddDotnetProject` / `addDotnetProject` to add a C# project or file-based app resource by path.

{% steps %}
1. ### Set up C# apps in the AppHost

   Add the `Aspire.Hosting.Dotnet` hosting integration to your AppHost, then use `AddDotnetProject` / `addDotnetProject` to model a C# project or file-based app resource by path. The host reference covers package installation, path resolution, and launch behavior.

   {% linkbutton "/integrations/frameworks/dotnet/dotnet-host/", variant: "secondary", icon_placement: "end", icon: "right-arrow" %}
Set up .NET / C# apps in the AppHost
{% endlinkbutton %}
{% endsteps %}

## See also

- [.NET documentation](https://learn.microsoft.com/dotnet/)
- [.NET / C# AppHost setup reference](/integrations/frameworks/dotnet/dotnet-host/)
- [Aspire integrations overview](/integrations/overview/)
