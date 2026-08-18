---
title: Browser app configuration
description: Configure generic JavaScript browser apps to send OpenTelemetry data to the Aspire dashboard with OTLP HTTP exporters.
---

A generic browser app uses the [JavaScript OTEL SDK](https://opentelemetry.io/docs/languages/js/getting-started/browser/) to send telemetry to the dashboard. Successfully sending telemetry to the dashboard requires the SDK to be configured with an OTLP HTTP exporter.

Before configuring the browser app, ensure the dashboard is configured with an [OTLP HTTP endpoint and CORS](/dashboard/enable-browser-telemetry/). For Blazor WebAssembly apps, use the 13.4 Aspire Blazor hosting gateway/proxy flow instead of this direct-to-dashboard JavaScript setup. For more information, see [Blazor WebAssembly integration](/dashboard/enable-browser-telemetry/blazor-webassembly/).

## OTLP exporter

OTLP exporters must be included in the browser app and configured with the SDK. For example, exporting distributed tracing with OTLP uses the [@opentelemetry/exporter-trace-otlp-proto](https://www.npmjs.com/package/@opentelemetry/exporter-trace-otlp-proto) package.

When OTLP is added to the SDK, specify these exporter options:

- `url`: The address that HTTP OTLP requests are made to. The address should be the dashboard HTTP OTLP endpoint and the path to the OTLP HTTP API. For example, `https://localhost:4318/v1/traces` for the trace OTLP exporter.
- `headers`: Optional headers sent with requests. If the OTLP endpoint requires authentication, only put headers in browser-visible configuration when the value is safe for your users to see.

:::caution
Browser app configuration is visible to users. Don't expose production dashboard API keys or other secrets to the browser. If the OTLP endpoint requires secret headers, send telemetry through a same-origin server proxy that injects those headers server-side.
:::

## Browser metadata

When a browser app is configured to collect distributed traces, the browser app can set the trace parent for browser spans using the `meta` element in the HTML. The value of the `name="traceparent"` meta element should correspond to the current trace.

In a server-rendered .NET app, the trace parent value can be assigned from `Activity.Current` by passing its `Activity.Id` value as the `content`:

```razor title="Layout"
<head>
    @if (Activity.Current is { } currentActivity)
    {
        <meta name="traceparent" content="@currentActivity.Id" />
    }
    <!-- Other elements omitted for brevity... -->
</head>
```

The preceding code sets the `traceparent` meta element to the current activity ID.

## Example browser telemetry code

The following JavaScript code demonstrates initialization of the OpenTelemetry JavaScript SDK and sending telemetry data to the dashboard:

```javascript title="telemetry.js"
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { ZoneContextManager } from '@opentelemetry/context-zone';

export function initializeTelemetry(otlpUrl, headers, resourceAttributes) {
    const otlpOptions = {
        url: `${otlpUrl}/v1/traces`,
        headers: parseDelimitedValues(headers),
    };

    const attributes = {
        'service.name': 'browser',
        ...parseDelimitedValues(resourceAttributes),
    };

    const provider = new WebTracerProvider({
        resource: resourceFromAttributes(attributes),
    });
    provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
    provider.addSpanProcessor(new SimpleSpanProcessor(new OTLPTraceExporter(otlpOptions)));

    provider.register({
        contextManager: new ZoneContextManager(),
    });

    registerInstrumentations({
        instrumentations: [new DocumentLoadInstrumentation()],
    });
}

function parseDelimitedValues(value) {
    const result = {};

    if (!value) {
        return result;
    }

    for (const entry of value.split(',')) {
        const separatorIndex = entry.indexOf('=');
        if (separatorIndex === -1) {
            continue;
        }

        const key = entry.slice(0, separatorIndex).trim();
        const parsedValue = entry.slice(separatorIndex + 1).trim();
        result[key] = parsedValue;
    }

    return result;
}
```

The preceding JavaScript code defines an `initializeTelemetry` function that expects the OTLP endpoint URL, optional headers, and resource attributes. A server-rendered app can pass browser-safe values into the page:

```razor title="Layout"
@using System.Diagnostics
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>@ViewData["Title"] - BrowserTelemetry</title>

    @if (Activity.Current is { } currentActivity)
    {
        <meta name="traceparent" content="@currentActivity.Id" />
    }
</head>
<body>
    @RenderBody()

    <script src="scripts/bundle.js"></script>
    @if (Environment.GetEnvironmentVariable("OTEL_EXPORTER_OTLP_ENDPOINT") is { Length: > 0 } endpointUrl)
    {
        var headers = Environment.GetEnvironmentVariable("OTEL_EXPORTER_OTLP_HEADERS");
        var attributes = Environment.GetEnvironmentVariable("OTEL_RESOURCE_ATTRIBUTES");
        <script>
            BrowserTelemetry.initializeTelemetry('@endpointUrl', '@headers', '@attributes');
        </script>
    }
</body>
</html>
```

:::tip
Bundling and minification of the JavaScript code is beyond the scope of this article.
:::

For a complete working example of configuring the JavaScript OTEL SDK to send telemetry to the dashboard, see the [browser telemetry sample](https://github.com/microsoft/aspire/tree/main/playground/BrowserTelemetry).

## See also

- [Enable browser telemetry overview](/dashboard/enable-browser-telemetry/)
- [Blazor WebAssembly integration](/dashboard/enable-browser-telemetry/blazor-webassembly/)
- [Aspire dashboard configuration](/dashboard/configuration/)
- [Standalone Aspire dashboard](/dashboard/standalone/)
- [Telemetry after deployment](/dashboard/telemetry-after-deployment/)
