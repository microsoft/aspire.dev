@description('The location for the resource(s) to be deployed.')
param location string = resourceGroup().location

param userPrincipalId string = ''

param tags object = { }

param production_acr_outputs_name string

resource production_mi 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: take('production_mi-${uniqueString(resourceGroup().id)}', 128)
  location: location
  tags: tags
}

resource production_acr 'Microsoft.ContainerRegistry/registries@2025-04-01' existing = {
  name: production_acr_outputs_name
}

resource production_acr_production_mi_AcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(production_acr.id, production_mi.id, subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d'))
  properties: {
    principalId: production_mi.properties.principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
    principalType: 'ServicePrincipal'
  }
  scope: production_acr
}

resource production_asplan 'Microsoft.Web/serverfarms@2025-03-01' = {
  name: take('productionasplan-${uniqueString(resourceGroup().id)}', 60)
  location: location
  properties: {
    perSiteScaling: true
    reserved: true
  }
  kind: 'Linux'
  sku: {
    name: 'P0V3'
    tier: 'Premium'
  }
}

resource production_contributor_mi 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: take('production_contributor_mi-${uniqueString(resourceGroup().id)}', 128)
  location: location
}

resource production_ra 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, production_contributor_mi.id, subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'acdd72a7-3385-48ef-bd42-f606fba81ae7'))
  properties: {
    principalId: production_contributor_mi.properties.principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'acdd72a7-3385-48ef-bd42-f606fba81ae7')
    principalType: 'ServicePrincipal'
  }
}

resource dashboard 'Microsoft.Web/sites@2025-03-01' = {
  name: take('${toLower('production')}-${toLower('aspiredashboard')}-${uniqueString(resourceGroup().id)}', 60)
  location: location
  properties: {
    serverFarmId: production_asplan.id
    siteConfig: {
      numberOfWorkers: 1
      linuxFxVersion: 'ASPIREDASHBOARD|1.0'
      acrUseManagedIdentityCreds: true
      acrUserManagedIdentityID: production_mi.properties.clientId
      appSettings: [
        {
          name: 'Dashboard__Frontend__AuthMode'
          value: 'Unsecured'
        }
        {
          name: 'Dashboard__Otlp__AuthMode'
          value: 'Unsecured'
        }
        {
          name: 'Dashboard__Otlp__SuppressUnsecuredTelemetryMessage'
          value: 'true'
        }
        {
          name: 'Dashboard__ResourceServiceClient__AuthMode'
          value: 'Unsecured'
        }
        {
          name: 'WEBSITES_PORT'
          value: '5000'
        }
        {
          name: 'HTTP20_ONLY_PORT'
          value: '4317'
        }
        {
          name: 'WEBSITE_START_SCM_WITH_PRELOAD'
          value: 'true'
        }
        {
          name: 'AZURE_CLIENT_ID'
          value: production_contributor_mi.properties.clientId
        }
        {
          name: 'ALLOWED_MANAGED_IDENTITIES'
          value: production_mi.properties.clientId
        }
        {
          name: 'ASPIRE_ENVIRONMENT_NAME'
          value: 'production'
        }
      ]
      alwaysOn: true
      http20Enabled: true
      http20ProxyFlag: 1
    }
  }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${production_contributor_mi.id}': { }
    }
  }
  kind: 'app,linux,aspiredashboard'
}

output name string = production_asplan.name

output planId string = production_asplan.id

output webSiteSuffix string = uniqueString(resourceGroup().id)

output AZURE_CONTAINER_REGISTRY_NAME string = production_acr.name

output AZURE_CONTAINER_REGISTRY_ENDPOINT string = production_acr.properties.loginServer

output AZURE_CONTAINER_REGISTRY_MANAGED_IDENTITY_ID string = production_mi.id

output AZURE_CONTAINER_REGISTRY_MANAGED_IDENTITY_CLIENT_ID string = production_mi.properties.clientId

output AZURE_WEBSITE_CONTRIBUTOR_MANAGED_IDENTITY_ID string = production_contributor_mi.id

output AZURE_WEBSITE_CONTRIBUTOR_MANAGED_IDENTITY_PRINCIPAL_ID string = production_contributor_mi.properties.principalId

output AZURE_APP_SERVICE_DASHBOARD_URI string = 'https://${take('${toLower('production')}-${toLower('aspiredashboard')}-${uniqueString(resourceGroup().id)}', 60)}.azurewebsites.net'