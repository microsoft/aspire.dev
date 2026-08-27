@description('The location for the resource(s) to be deployed.')
param location string = resourceGroup().location

resource aspiredev_identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: take('aspiredev_identity-${uniqueString(resourceGroup().id)}', 128)
  location: location
}

output id string = aspiredev_identity.id

output clientId string = aspiredev_identity.properties.clientId

output principalId string = aspiredev_identity.properties.principalId

output principalName string = aspiredev_identity.name

output name string = aspiredev_identity.name