param frontDoorName string
param appServiceHostName string

@description('Location for all resources, needed because Aspire always injects a location parameter')
param location string = resourceGroup().location

resource frontDoorProfile 'Microsoft.Cdn/profiles@2024-02-01' = {
  name: take('${frontDoorName}${uniqueString(resourceGroup().id)}', 50)
  location: 'Global'
  sku: {
    name: 'Premium_AzureFrontDoor'
  }
}

resource frontDoorEndpoint 'Microsoft.Cdn/profiles/afdEndpoints@2025-06-01' = {
  parent: frontDoorProfile
  name: take('${frontDoorName}-endp-${uniqueString(resourceGroup().id)}', 50)
  location: 'Global'
  properties: {
    enabledState: 'Enabled'
  }
}

resource originGroup 'Microsoft.Cdn/profiles/originGroups@2025-06-01' = {
  parent: frontDoorProfile
  name: take('appservice-origin-group-${uniqueString(resourceGroup().id)}', 50)
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
      additionalLatencyInMilliseconds: 50
    }
    healthProbeSettings: {
      probePath: '/'
      probeRequestType: 'HEAD'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 240
    }
    sessionAffinityState: 'Disabled'
  }
}

resource origin 'Microsoft.Cdn/profiles/originGroups/origins@2025-06-01' = {
  parent: originGroup
  name: take('appservice-origin-${uniqueString(resourceGroup().id)}', 50)
  properties: {
    hostName: take('${appServiceHostName}-${uniqueString(resourceGroup().id)}.azurewebsites.net', 50)
    httpPort: 80
    httpsPort: 443
    originHostHeader: take('${appServiceHostName}-${uniqueString(resourceGroup().id)}.azurewebsites.net', 50)
    priority: 1
    weight: 1000
    enabledState: 'Enabled'
    enforceCertificateNameCheck: true
  }
}

resource route 'Microsoft.Cdn/profiles/afdEndpoints/routes@2025-06-01' = {
  parent: frontDoorEndpoint
  name: take('default-route-${uniqueString(resourceGroup().id)}', 50)
  dependsOn: [
    origin
  ]
  properties: {
    cacheConfiguration: {
      compressionSettings: {
        isCompressionEnabled: true
        contentTypesToCompress: [
          'text/plain'
          'text/html'
          'text/css'
          'application/javascript'
          'application/json'
          'image/svg+xml'
        ]
      }
      queryStringCachingBehavior: 'IgnoreQueryString'
    }
    originGroup: {
      id: originGroup.id
    }
    supportedProtocols: [
      'Http'
      'Https'
    ]
    patternsToMatch: [
      '/*'
    ]
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: 'Enabled'
    httpsRedirect: 'Enabled'
    enabledState: 'Enabled'
    originPath: '/'
    ruleSets: []
  }
}

output endpointUrl string = 'https://${frontDoorEndpoint.properties.hostName}'
