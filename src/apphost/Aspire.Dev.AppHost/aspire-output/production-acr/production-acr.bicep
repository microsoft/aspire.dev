@description('The location for the resource(s) to be deployed.')
param location string = resourceGroup().location

resource production_acr 'Microsoft.ContainerRegistry/registries@2025-04-01' = {
  name: take('productionacr${uniqueString(resourceGroup().id)}', 50)
  location: location
  sku: {
    name: 'Basic'
  }
  tags: {
    'aspire-resource-name': 'production-acr'
  }
}

output name string = production_acr.name

output loginServer string = production_acr.properties.loginServer