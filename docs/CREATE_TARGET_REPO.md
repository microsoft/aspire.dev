# Creating a Target Repository for Interactive Quickstart

This guide shows how to create a repository that works with the aspire.dev Interactive Quickstart experience.

## Repository Structure

Your repository should have:

```
your-aspire-sample/
├── .devcontainer/
│   └── devcontainer.json
├── .tours/
│   └── quickstart.tour
├── src/
│   ├── Host/
│   │   ├── Program.cs
│   │   └── Host.csproj
│   ├── Api/
│   │   ├── Program.cs
│   │   └── Api.csproj
│   └── App/
│       ├── package.json
│       └── src/
├── README.md
└── .gitignore
```

## 1. DevContainer Configuration

Create `.devcontainer/devcontainer.json`:

```json
{
  "name": "Aspire Quickstart",
  "image": "mcr.microsoft.com/devcontainers/dotnet:1-8.0",
  "features": {
    "ghcr.io/devcontainers/features/node:1": {
      "version": "lts"
    },
    "ghcr.io/devcontainers/features/docker-in-docker:2": {}
  },
  "postCreateCommand": "dotnet workload update && dotnet workload install aspire",
  "customizations": {
    "vscode": {
      "extensions": [
        "ms-dotnettools.csharp",
        "ms-dotnettools.csdevkit",
        "ms-azuretools.vscode-docker",
        "vsls-contrib.codetour",
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode"
      ],
      "settings": {
        "codetour.showMarkers": true
      }
    }
  },
  "forwardPorts": [15001, 7001, 5173],
  "portsAttributes": {
    "15001": {
      "label": "Aspire Dashboard",
      "onAutoForward": "notify"
    },
    "7001": {
      "label": "API",
      "onAutoForward": "silent"
    },
    "5173": {
      "label": "Frontend",
      "onAutoForward": "openBrowser"
    }
  }
}
```

### Key Elements

- **Base Image**: .NET 8.0 SDK
- **Features**: Node.js LTS for frontend, Docker for containerization
- **Post-Create**: Installs Aspire workload
- **Extensions**: C#, CodeTour, Docker support
- **Port Forwarding**: Dashboard (15001), API (7001), Frontend (5173)

## 2. CodeTour Configuration

Create `.tours/quickstart.tour`:

```json
{
  "$schema": "https://aka.ms/codetour-schema",
  "title": "Quick Tour",
  "steps": [
    {
      "title": "Welcome to Aspire",
      "description": "This tour will guide you through a full-stack Aspire application. You'll learn how Aspire orchestrates services, handles service discovery, and simplifies cloud-native development.\n\n**What is Aspire?**\n- Cloud-ready stack for building distributed apps\n- Built-in orchestration and service discovery\n- Integrated observability with OpenTelemetry\n- Production-ready defaults\n\nClick **Next** to continue."
    },
    {
      "file": "src/Host/Program.cs",
      "line": 3,
      "title": "App Host Overview",
      "description": "## The App Host\n\nThe App Host is the orchestrator for your Aspire application. It:\n- Defines all projects, containers, and resources\n- Manages service discovery\n- Configures communication between services\n- Provides the Aspire Dashboard\n\n**Why?** Having a single orchestration point makes it easy to manage complex applications."
    },
    {
      "file": "src/Host/Program.cs",
      "line": 5,
      "title": "Adding the API Project",
      "description": "## AddProject<T>\n\n```csharp\nvar api = builder.AddProject<Projects.Api>(\"api\");\n```\n\nThis adds your ASP.NET Core API project as a managed resource.\n\n**What happens:**\n- Aspire builds and runs the project\n- Assigns it a service name (\"api\")\n- Makes it discoverable to other services\n- Monitors it in the dashboard\n\n**Pro tip:** The generic type `Projects.Api` is auto-generated from your solution structure."
    },
    {
      "file": "src/Host/Program.cs",
      "line": 7,
      "title": "Integrating Frontend with AddNpmApp",
      "description": "## AddNpmApp for Node.js Projects\n\n```csharp\nbuilder.AddNpmApp(\"app\", \"../App\")\n    .WithReference(api)\n    .WithHttpEndpoint(env: \"PORT\")\n    .WithExternalHttpEndpoints();\n```\n\n**Breaking it down:**\n- `AddNpmApp`: Integrates npm-based frontends (React, Vue, etc.)\n- `WithReference(api)`: Connects frontend to backend via service discovery\n- `WithHttpEndpoint`: Exposes HTTP endpoint\n- `WithExternalHttpEndpoints`: Makes it accessible externally\n\n**The Magic:** `WithReference(api)` automatically injects environment variables so your frontend knows how to reach the API!"
    },
    {
      "file": "src/Api/Program.cs",
      "line": 15,
      "title": "API Endpoint",
      "description": "## Simple Minimal API\n\nThis is a standard ASP.NET Core minimal API:\n\n```csharp\napp.MapGet(\"/weatherforecast\", () => { ... });\n```\n\n**What's special?**\n- Nothing! That's the point.\n- No Aspire-specific code needed\n- Works standalone or in Aspire\n- Aspire handles service discovery automatically\n\n**Result:** Your API is now discoverable at `http://api` from other services."
    },
    {
      "file": "src/App/src/App.tsx",
      "line": 8,
      "title": "Frontend Service Discovery",
      "description": "## Consuming the API\n\n```typescript\nconst apiUrl = import.meta.env.VITE_services__api__https__0 || \n               import.meta.env.VITE_services__api__http__0;\n```\n\n**How it works:**\n1. Aspire injects environment variables with service URLs\n2. Naming convention: `VITE_services__{serviceName}__{protocol}__{index}`\n3. Your frontend automatically discovers the API\n\n**No hardcoded URLs!** Works in development, testing, and production.\n\n**Try it:** After running the app, check the browser console to see the actual URL."
    },
    {
      "title": "Next Steps",
      "description": "## 🎉 Tour Complete!\n\nYou've learned:\n- ✅ How App Host orchestrates services\n- ✅ Adding .NET and npm projects\n- ✅ Service discovery and references\n- ✅ Building full-stack apps with Aspire\n\n**Now let's run it!**\n\n1. Open the terminal (Ctrl + `)\n2. Run: `aspire run`\n3. Dashboard opens automatically\n4. Explore the Aspire Dashboard\n5. Test the API and frontend endpoints\n\nClick **Finish Tour** when ready!"
    }
  ]
}
```

## 3. Comprehensive README

Create a `README.md` with:

### Required Sections

#### Quick Launch Button

```markdown
## 🚀 Quick Start

Click to open in GitHub Codespaces (everything pre-configured):

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/YOUR-USERNAME/YOUR-REPO)
```

#### What, Why, How

```markdown
## What is this?

A full-stack Aspire sample demonstrating:
- Service orchestration with App Host
- ASP.NET Core minimal API backend
- React frontend with TypeScript
- Automatic service discovery
- Built-in observability

## Why Aspire?

- **Simplified orchestration**: One command runs everything
- **Service discovery**: Services find each other automatically
- **Cloud-ready**: Built for containers and Kubernetes
- **Production defaults**: Security, logging, health checks included

## How to Use

### Option 1: GitHub Codespaces (Recommended)
1. Click the Codespaces button above
2. Wait for environment setup (~2 minutes)
3. Follow the CodeTour (it starts automatically)
4. Run the app and explore!

### Option 2: Local Development
Prerequisites:
- .NET 8 SDK
- Node.js 20+ LTS
- Docker Desktop

Steps:
# ... installation steps
```

#### CodeTour Section

```markdown
## 🗺️ Interactive Code Tour

This repository includes a CodeTour that guides you through the code.

**In VS Code/Codespaces:**
1. Look for the **CodeTour** panel in Explorer
2. Select "Quick Tour"
3. Click "Start Tour"

**Features:**
- Step-by-step code explanations
- What, why, and how for each component
- Interactive learning experience
```

#### Running the App

```markdown
## ▶️ Running the Application

### Using Aspire CLI
```bash
aspire run

# The Aspire CLI automatically opens the dashboard
# with authentication in your browser


### Using Debugger
1. Open `src/Host/Program.cs`
2. Press F5 or click the Play button
3. The dashboard opens automatically
4. Find the login token in the Debug Console (search for `t=`)

### What to Explore
1. **Aspire Dashboard**: Monitor all services, logs, traces
2. **API Endpoint**: https://localhost:7001/weatherforecast
3. **React App**: Consumes API and displays weather data
```

## 4. App Host Implementation

`src/Host/Program.cs`:

```csharp
var builder = DistributedApplication.CreateBuilder(args);

// Add the API project
var api = builder.AddProject<Projects.Api>("api");

// Add the React frontend with npm
builder.AddNpmApp("app", "../App")
    .WithReference(api)  // Connect to API
    .WithEnvironment("BROWSER", "none")  // Don't auto-open browser
    .WithHttpEndpoint(env: "PORT")
    .WithExternalHttpEndpoints()
    .PublishAsDockerFile();

builder.Build().Run();
```

## 5. API Implementation

`src/Api/Program.cs`:

```csharp
var builder = WebApplication.CreateBuilder(args);

// Add Aspire defaults (health checks, telemetry, etc.)
builder.AddServiceDefaults();

// Enable CORS for frontend
builder.Services.AddCors();

var app = builder.Build();

app.UseCors(policy => policy
    .AllowAnyOrigin()
    .AllowAnyMethod()
    .AllowAnyHeader());

// Map Aspire health checks and telemetry
app.MapDefaultEndpoints();

var summaries = new[]
{
    "Freezing", "Bracing", "Chilly", "Cool", "Mild",
    "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
};

app.MapGet("/weatherforecast", () =>
{
    var forecast = Enumerable.Range(1, 5).Select(index =>
        new WeatherForecast
        (
            DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
            Random.Shared.Next(-20, 55),
            summaries[Random.Shared.Next(summaries.Length)]
        ))
        .ToArray();
    return forecast;
})
.WithName("GetWeatherForecast")
.WithOpenApi();

app.Run();

record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}
```

## 6. Frontend Service Discovery

`src/App/src/App.tsx`:

```typescript
import { useEffect, useState } from 'react';

interface WeatherForecast {
  date: string;
  temperatureC: number;
  temperatureF: number;
  summary: string;
}

function App() {
  const [forecasts, setForecasts] = useState<WeatherForecast[]>([]);
  const [loading, setLoading] = useState(true);

  // Service discovery via environment variables injected by Aspire
  const apiUrl = 
    import.meta.env.VITE_services__api__https__0 || 
    import.meta.env.VITE_services__api__http__0;

  useEffect(() => {
    fetch(`${apiUrl}/weatherforecast`)
      .then(response => response.json())
      .then(data => {
        setForecasts(data);
        setLoading(false);
      })
      .catch(error => {
        console.error('Error fetching weather:', error);
        setLoading(false);
      });
  }, [apiUrl]);

  if (loading) return <div>Loading weather data...</div>;

  return (
    <div className="App">
      <h1>Weather Forecast</h1>
      <p>Powered by Aspire</p>
      <p>API URL: {apiUrl}</p>
      
      <div className="forecasts">
        {forecasts.map((forecast, index) => (
          <div key={index} className="forecast-card">
            <h3>{forecast.date}</h3>
            <p>{forecast.temperatureC}°C / {forecast.temperatureF}°F</p>
            <p>{forecast.summary}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
```

## 7. Testing Your Repository

### Local Test

1. Push to GitHub
2. Open in Codespaces
3. Wait for setup to complete
4. Verify CodeTour appears
5. Run `aspire run`
6. Check all endpoints work

### Integration with aspire.dev

1. Update the quickstart page with your repo details:

   ```astro
   <CodespacesLauncher owner="your-username" repo="your-repo" />
   ```

2. Update CodeTour steps if your structure differs
3. Test the full flow

## Tips for Success

### 1. Keep It Simple

- Focus on one clear concept
- Minimize dependencies
- Clear, commented code

### 2. Comprehensive Documentation

- Explain every step
- Include screenshots
- Provide troubleshooting section

### 3. Fast Setup

- Optimize devcontainer image
- Pre-install everything possible
- Test on fresh Codespaces

### 4. Engaging Tour

- Tell a story
- Use emojis and formatting
- Interactive elements (copy buttons)
- Keep steps under 2-3 minutes each

### 5. Error Handling

- Provide fallbacks
- Clear error messages
- Link to documentation

## Example Repositories

- [IEvangelist/fullstack-js](https://github.com/IEvangelist/fullstack-js) - Full-stack with React
- [dotnet/aspire-samples](https://github.com/dotnet/aspire-samples) - Official samples

## Need Help?

- [Aspire Docs](https://learn.microsoft.com/dotnet/aspire/)
- [GitHub Codespaces Docs](https://docs.github.com/codespaces)
- [CodeTour Extension](https://marketplace.visualstudio.com/items?itemName=vsls-contrib.codetour)

---

Happy building! 🚀
