@description('The location for the resource(s) to be deployed.')
param location string = resourceGroup().location

param live_config_outputs_name string

param principalId string

resource live_config 'Microsoft.KeyVault/vaults@2024-11-01' existing = {
  name: live_config_outputs_name
}

resource live_config_KeyVaultSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(live_config.id, principalId, subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6'))
  properties: {
    principalId: principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalType: 'ServicePrincipal'
  }
  scope: live_config
}