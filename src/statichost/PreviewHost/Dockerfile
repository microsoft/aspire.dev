# syntax=docker/dockerfile:1.7

FROM mcr.microsoft.com/dotnet/sdk:10.0-noble AS build
WORKDIR /src

COPY . ./

RUN dotnet publish ./PreviewHost.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble AS unzip-tools
RUN apt-get update \
    && apt-get install -y --no-install-recommends unzip \
    && rm -rf /var/lib/apt/lists/*

FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled AS final
WORKDIR /app

COPY --from=unzip-tools /usr/bin/unzip /usr/bin/unzip
COPY --from=unzip-tools /lib/x86_64-linux-gnu/libbz2.so.1.0* /lib/x86_64-linux-gnu/
COPY --from=build /app/publish/ ./

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "PreviewHost.dll"]
