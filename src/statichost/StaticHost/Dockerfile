# =============================================================================
# StaticHost container with Node.js for Astro SSR
# Build context: src/statichost/StaticHost/ (set by Aspire PublishAsDockerFile)
#
# This Dockerfile layers Node.js onto the pre-built .NET app.
# The publish output (bin/Release/net10.0/linux-x64/publish) must exist
# before the Docker build — run 'dotnet publish' from the solution root first.
# =============================================================================

FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl && \
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy pre-built publish output from the host build
COPY bin/Release/net10.0/publish/ .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "StaticHost.dll"]
