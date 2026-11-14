---
title: Docker Compose to Aspire AppHost reference
description: Quick reference for converting Docker Compose YAML syntax to Aspire AppHost API calls — services, networks, volumes, environment variables, and health checks.
---

This reference provides systematic mappings from Docker Compose YAML syntax to equivalent Aspire AppHost API calls. Use these tables as a quick reference when converting your existing Docker Compose files to Aspire application host configurations.

## Service definitions

| Docker Compose | Aspire | Notes |
|----------------|-------------|-------|
| `services:` | `var builder = DistributedApplication.CreateBuilder(args)` | Root application builder used for adding and representing resources |
| `service_name:` | `builder.Add*("service_name")` | Service name becomes resource name |

{% learnmore %}
Learn more about [Docker Compose services](https://docs.docker.com/compose/compose-file/05-services/).
{% endlearnmore %}

## Images and builds

| Docker Compose | Aspire | Notes |
|----------------|-------------|-------|
| `image: nginx:latest` | `builder.AddContainer("name", "nginx", "latest")` | Direct image reference |
| `build: .` | `builder.AddDockerfile("name", ".")` | Build from Dockerfile |
| `build: ./path` | `builder.AddDockerfile("name", "./path")` | Build from specific path |
| `build.context: ./app` | `builder.AddDockerfile("name", "./app")` | Build context |
| `build.dockerfile: Custom.dockerfile` | `builder.Add*("name").WithDockerfile("Custom.dockerfile")` | Custom Dockerfile name |
| Generated Dockerfile | `builder.AddDockerfileBuilder("name", "./app", callback, stage: "runtime")` | Generate the Dockerfile from AppHost code |

{% learnmore %}
Learn more about [Docker Compose build reference](https://docs.docker.com/compose/compose-file/build/) and [WithDockerfile](/app-host/withdockerfile/).
{% endlearnmore %}

## Pull policy

| Docker Compose | Aspire | Notes |
|----------------|-------------|-------|
| `pull_policy: always` | `.WithImagePullPolicy(ImagePullPolicy.Always)` | Always pull the image |
| `pull_policy: missing` | `.WithImagePullPolicy(ImagePullPolicy.Missing)` | Pull only if not present locally |
| `pull_policy: never` | `.WithImagePullPolicy(ImagePullPolicy.Never)` | Never pull from registry |

{% learnmore %}
Learn more about [Docker Compose pull_policy](https://docs.docker.com/reference/compose-file/services/#pull_policy) and [image pull policy](/integrations/compute/docker/#configure-image-pull-policy).
{% endlearnmore %}

## .NET projects

| Docker Compose | Aspire | Notes |
|----------------|-------------|-------|
| `build: ./MyApi` (for .NET) | `builder.AddProject<Projects.MyApi>("myapi")` | Direct .NET project reference |

{% learnmore %}
Learn more about [adding .NET projects](/get-started/app-host/).
{% endlearnmore %}

## Port mappings

| Docker Compose | Aspire | Notes |
|----------------|-------------|-------|
| `ports: ["8080:80"]` | `.WithHttpEndpoint(port: 8080, targetPort: 80)` | HTTP endpoint mapping. Ports are optional; dynamic ports are used if omitted |
| `ports: ["443:443"]` | `.WithHttpsEndpoint(port: 443, targetPort: 443)` | HTTPS endpoint mapping. Ports are optional; dynamic ports are used if omitted |
| `expose: ["8080"]` | `.WithEndpoint(port: 8080)` | Internal port exposure. Ports are optional; dynamic ports are used if omitted |

{% learnmore %}
Learn more about [Docker Compose ports](https://docs.docker.com/compose/compose-file/05-services/#ports) and [endpoint configuration](/fundamentals/networking-overview/).
{% endlearnmore %}

## Environment variables

| Docker Compose | Aspire / Notes |
|----------------|-------------|
| `environment: KEY=value` | `.WithEnvironment("KEY", "value")` <br/> Static environment variable |
| `environment: KEY=${HOST_VAR}` | `.WithEnvironment(context => context.EnvironmentVariables["KEY"] = hostVar)` <br/> Environment variable with callback context |
| `environment: KEY=${PARAM}` | `.AsEnvironmentPlaceholder(resource)` inside `.PublishAsDockerComposeService(...)` <br/> Compose environment variable placeholder |
| `env_file: .env` | `.ConfigureEnvFile(env => { ... })` <br/> Environment file customization (available in 13.1+) |

{% learnmore %}
Learn more about [Docker Compose environment](https://docs.docker.com/compose/compose-file/05-services/#environment) and [external parameters](/fundamentals/external-parameters/).
{% endlearnmore %}

## Volumes and storage

| Docker Compose | Aspire | Notes |
|----------------|-------------|-------|
| `volumes: ["data:/app/data"]` | `.WithVolume("data", "/app/data")` | Named volume |
| `volumes: ["./host:/container"]` | `.WithBindMount("./host", "/container")` | Bind mount |
| `volumes: ["./config:/app:ro"]` | `.WithBindMount("./config", "/app", isReadOnly: true)` | Read-only bind mount |

{% learnmore %}
Learn more about [Docker Compose volumes](https://docs.docker.com/compose/compose-file/05-services/#volumes) and [persist container data](/fundamentals/persist-data-volumes/).
{% endlearnmore %}

## Dependencies and ordering

| Docker Compose | Aspire | Notes |
|----------------|-------------|-------|
| `depends_on: [db]` | `.WithReference(db)` | Service dependency with connection string injection |
| `depends_on: db: condition: service_started` | `.WaitFor(db)` | Wait for service start |
| `depends_on: db: condition: service_healthy` | `.WaitForCompletion(db)` | Wait for health check to pass |

{% learnmore %}
Learn more about [Docker Compose depends_on](https://docs.docker.com/compose/compose-file/05-services/#depends_on) and [launch profiles](/integrations/dotnet/launch-profiles/).
{% endlearnmore %}

## Networks

| Docker Compose | Aspire | Notes |
|----------------|-------------|-------|
| `networks: [backend]` | Automatic | Aspire handles networking automatically |
| Service host name on a Compose network | `.GetHostAddressExpression(endpoint)` | Produces the generated Docker Compose service host name for an endpoint |
| Custom networks | `.ConfigureComposeFile(file => { ... })` | Customize the generated Compose file when automatic networking isn't enough |

{% learnmore %}
Learn more about [Docker Compose networks](https://docs.docker.com/compose/compose-file/05-services/#networks) and [service discovery](/fundamentals/service-discovery/).
{% endlearnmore %}

## Resource limits

| Docker Compose | Aspire | Notes |
|----------------|-------------|-------|
| `deploy.resources.limits.memory: 512m` | Not supported | Resource limits aren't supported in Aspire |
| `deploy.resources.limits.cpus: 0.5` | Not supported | Resource limits aren't supported in Aspire |

{% learnmore %}
Learn more about [Docker Compose deploy reference](https://docs.docker.com/compose/compose-file/deploy/).
{% endlearnmore %}

## Health checks

| Docker Compose | Aspire | Notes |
|----------------|-------------|-------|
| `healthcheck.test: ["CMD", "curl", "http://localhost/health"]` | Built-in for integrations | Aspire integrations include health checks |
| `healthcheck.interval: 30s` | Configurable in integration | Health check configuration varies by resource type |

{% learnmore %}
Learn more about [Docker Compose healthcheck](https://docs.docker.com/compose/compose-file/05-services/#healthcheck) and [health checks](/fundamentals/health-checks/).
{% endlearnmore %}

## Restart policies

| Docker Compose | Aspire | Notes |
|----------------|-------------|-------|
| `restart: unless-stopped` | `.PublishAsDockerComposeService((resource, service) => service.Restart = "unless-stopped")` | Customize the generated Docker Compose service |
| `restart: always` | `.PublishAsDockerComposeService((resource, service) => service.Restart = "always")` | Customize the generated Docker Compose service |
| `restart: no` | Default | No restart policy |

{% learnmore %}
Learn more about [Docker Compose restart](https://docs.docker.com/compose/compose-file/05-services/#restart).
{% endlearnmore %}

## Logging

| Docker Compose | Aspire | Notes |
|----------------|-------------|-------|
| `logging.driver: json-file` | Built-in | Aspire provides integrated logging |
| `logging.options.max-size: 10m` | Dashboard configuration | Managed through Aspire dashboard |

{% learnmore %}
Learn more about [Docker Compose logging](https://docs.docker.com/compose/compose-file/05-services/#logging) and [telemetry](/fundamentals/telemetry/).
{% endlearnmore %}

## Database services

| Docker Compose | Aspire | Notes |
|----------------|-------------|-------|
| `image: postgres:15` | `builder.AddPostgres("name")` | PostgreSQL with automatic configuration |
| `image: mysql:8` | `builder.AddMySql("name")` | MySQL with automatic configuration |
| `image: redis:7` | `builder.AddRedis("name")` | Redis with automatic configuration |
| `image: mongo:latest` | `builder.AddMongoDB("name")` | MongoDB with automatic configuration |

{% learnmore %}
Learn more about [Docker Compose services](https://docs.docker.com/compose/compose-file/05-services/) and [database integrations](/integrations/gallery/?search=database).
{% endlearnmore %}

## See also

- [Migrate from Docker Compose to Aspire](/app-host/migrate-from-docker-compose/)
- [AppHost overview](/get-started/app-host/)
- [WithDockerfile](/app-host/withdockerfile/)
