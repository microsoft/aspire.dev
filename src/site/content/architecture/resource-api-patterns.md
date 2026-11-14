---
title: Resource API Patterns
seoTitle: Aspire resource API patterns for AppHost integrations
description: Discover common API resource patterns in Aspire, including how to add and configure resources, use annotations, and compose hosting and client integrations.
---

Aspire's resource model allows you to define and configure resources in a structured way, enabling seamless integration and management of your application's components. This guide provides details the common patterns for adding and configuring resources in Aspire.

## API patterns

Aspire separates **resource data models** from **behavior** using **fluent extension methods**.  
- **Resource classes** define only constructors and properties.  
- **Extension methods** implement resource creation, configuration, and runtime wiring.  

This guide describes each pattern and shows a **verbatim Redis example** at the end. It also covers how to publish manifests via custom resources.

## Adding resources with `AddX(...)`

An `AddX(...)` method executes:

{% steps %}
1. **Validate inputs** (`builder`, `name`, required arguments).  
1. **Instantiate** the data-only resource (`new TResource(...)`).  
1. **Register** it with `builder.AddResource(resource)`.  
1. **Optional wiring** of endpoints, health checks, container settings, environment variables, command-line arguments, and event subscriptions.
{% endsteps %}

### Signature pattern

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript
// Resources are added via async builder methods:
const resource = await builder.addRedis("name" /*, optional params */);

// The builder handles validation, instantiation,
// and registration internally. Optional wiring:
//    .withEndpoint(...)
//    .withHealthCheck(...)
//    .withImage(...)
//    .withEnvironment(...)
//    .withArgs(...)
//    builder.addEventingSubscriber(...)
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp
public static IResourceBuilder<TResource> AddX(
    this IDistributedApplicationBuilder builder,
    [ResourceName] string name,
    /* optional parameters */)
{
    // 1. Validate inputs
    // 2. Instantiate resource
    // 3. builder.AddResource(resource)
    // 4. Optional wiring:
    //    .WithEndpoint(...)
    //    .WithHealthCheck(...)
    //    .WithImage(...)
    //    .WithEnvironment(...)
    //    .WithArgs(...)
    //    Eventing.Subscribe<...>(...)
}
```
{% endtab %}
{% endtabs %}

### Optional wiring examples

**Endpoints**:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript
resource.withEndpoint({ port: hostPort, targetPort: containerPort, name: endpointName });
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp
.WithEndpoint(port: hostPort, targetPort: containerPort, name: endpointName)
```
{% endtab %}
{% endtabs %}

**Health checks**:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript
resource.withHealthCheck(healthCheckKey);
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp
.WithHealthCheck(healthCheckKey)
```
{% endtab %}
{% endtabs %}

**Container images / registries**:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript
resource.withImage(imageName, imageTag);
resource.withImageRegistry(registryUrl);
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp
.WithImage(imageName, imageTag)
.WithImageRegistry(registryUrl)
```
{% endtab %}
{% endtabs %}

**Entrypoint and args**:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript
resource.withEntrypoint("/bin/sh");
resource.withArgs(["--flag", "value"]);
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp
.WithEntrypoint("/bin/sh")
.WithArgs(context => { /* build args */ return Task.CompletedTask; })
```
{% endtab %}
{% endtabs %}

**Environment variables**:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript
resource.withEnvironment("ENV_VAR", value);
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp
.WithEnvironment(context => new("ENV_VAR", valueProvider))
```
{% endtab %}
{% endtabs %}

**Event subscriptions**:

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript
builder.addEventingSubscriber(async (context) => {
    context.onBeforeStart(async (event) => {
        // Handle event
    });
});
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp
builder.Eventing.Subscribe<EventType>(resource, handler);
```
{% endtab %}
{% endtabs %}

### Summary table

| Step | Call/Method | Purpose |
|--|--|--|
| Validate | `ArgumentNullException.ThrowIfNull(...)` | Ensure non-null builder, name, and args |
| Instantiate | `new TResource(name, …)` | Create data-only instance |
| Register | `builder.AddResource(resource)` | Add resource to the application model |
| Optional wiring | `.WithEndpoint(…)`, `.WithHealthCheck(…)`, `.WithImage(…)`, `.WithEnvironment(…)`, `.WithArgs(…)`, `Eventing.Subscribe(…)` | Configure container details, wiring, and runtime hooks |

## Configuring resources with `WithX(...)`

`WithX(...)` methods **attach annotations** to resource builders.

### Signature pattern

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
:::note
The TypeScript SDK doesn't expose `withAnnotation(...)` directly. Configuration methods like `withEndpoint(...)` and `withEnvironment(...)` handle annotation attachment internally.
:::
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp
public static IResourceBuilder<TResource> WithX(
    this IResourceBuilder<TResource> builder,
    FooOptions options) =>
    builder.WithAnnotation(new FooAnnotation(options));
```
{% endtab %}
{% endtabs %}

- **Target**: `IResourceBuilder<TResource>`.
- **Action**: `WithAnnotation(...)`.
- **Returns**: `IResourceBuilder<TResource>`.

### Summary table

| Method | Target | Action |
|--|--|--|
| `WithX(...)` | `IResourceBuilder<TResource>` | Attaches `XAnnotation` using the `WithAnnotation` API. |
| Returns | `IResourceBuilder<TResource>` | Enables fluent chaining . |

## Annotations

Annotations are **public** metadata types implementing `IResourceAnnotation`. They can be added or removed dynamically at runtime via hooks or events. Consumers can query annotations using `TryGetLastAnnotation<T>()` when necessary.

### Definition and attachment

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
:::note
The TypeScript SDK doesn't expose annotations as a user-facing pattern. Resource metadata is managed internally by the SDK's configuration methods.
:::
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp
public sealed record PersistenceAnnotation(
    TimeSpan? Interval,
    int KeysChangedThreshold) : IResourceAnnotation;

builder.WithAnnotation(new PersistenceAnnotation(
    TimeSpan.FromSeconds(60),
    100));
```
{% endtab %}
{% endtabs %}

### Summary table

| Concept | Pattern | Notes |
|--|--|--|
| Annotation Type | `public record XAnnotation(...) : IResourceAnnotation` | Public to support dynamic runtime use. |
| Attach | `builder.WithAnnotation(new XAnnotation(...))` | Adds metadata to resource builder. |
| Query | `resource.TryGetLastAnnotation<XAnnotation>(out var a)` | Consumers inspect annotations as needed. |

## Custom value objects

Custom value objects defer evaluation and allow the framework to discover dependencies between resources.

### Core interfaces

| Interface | Member | Mode | Purpose |
|--|--|--|--|
| `IValueProvider` | `ValueTask<string?> GetValueAsync(CancellationToken)` | Run | Resolve live values at runtime |
| `IManifestExpressionProvider` | `string ValueExpression { get; }` | Publish | Emit structured expressions in manifests |
| `IExpressionValue` | Inherits `IValueProvider` and `IManifestExpressionProvider` | Run and publish | Mark a value object as usable wherever an expression-backed value is accepted |
| `IValueWithReferences` _(opt.)_ | `IEnumerable<object> References { get; }` | Both (if needed) | Declare dependencies on other resources |

- **Implement** `IValueProvider` and `IManifestExpressionProvider` on all structured value types.  
- **Implement** `IExpressionValue` when a structured value type should be accepted by APIs such as {% api "Aspire.Hosting.ResourceBuilderExtensions.WithEnvironment" %}.
- **Implement** `IValueWithReferences` only when your type holds resource references.

### Attaching to resources

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
```typescript
resource.withEnvironment("REDIS_CONNECTION_STRING", redis);
```
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp
builder.WithEnvironment(context =>
    new("REDIS_CONNECTION_STRING", redis.GetConnectionStringAsync));
```
{% endtab %}
{% endtabs %}

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
:::note
In the TypeScript SDK, `BicepOutputReference` and the value provider interfaces exist as read-only types. Users consume these types (e.g., via `resource.getOutput("name")`) but don't implement custom value objects.
:::
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp title="Example: BicepOutputReference"
public sealed partial class BicepOutputReference : 
    IManifestExpressionProvider, 
    IValueProvider, 
    IValueWithReferences
{
    public string ValueExpression { get; }
    public ValueTask<string?> GetValueAsync(CancellationToken cancellationToken = default);
    IEnumerable<object> IValueWithReferences.References { get; }
}
```
{% endtab %}
{% endtabs %}

{% tabs sync: "aspire-lang" %}
{% tab "TypeScript", id: "typescript" %}
:::note
In the TypeScript SDK, `withEnvironment()` handles value binding directly without requiring custom annotation types.
:::
{% endtab %}
{% tab "C#", id: "csharp" %}
```csharp
public static IResourceBuilder<T> WithEnvironment<T>(
    this IResourceBuilder<T> builder,
    string name,
    BicepOutputReference bicepOutputReference)
    where T : IResourceWithEnvironment
{
    return builder.WithAnnotation(
      new EnvironmentVariableAnnotation(name, bicepOutputReference));
}
```
{% endtab %}
{% endtabs %}

### Summary table

| Concept | Pattern | Purpose |
|--|--|--|
| `IValueProvider` | `GetValueAsync(...)` | Deferred runtime resolution |
| `IManifestExpressionProvider` | `ValueExpression` | Structured publish-time expression |
| `IExpressionValue` | `IValueProvider` + `IManifestExpressionProvider` | Reusable expression-backed value |
| `IValueWithReferences` _(opt.)_ | `References` | Declare resource dependencies |
| `WithEnvironment(...)` | `new("NAME", valueProvider)` | Attach structured values unflattened |
