@description('The location for the resource(s) to be deployed.')
param location string = resourceGroup().location

param aspiredev_host string

resource frontdoor_afd 'Microsoft.Cdn/profiles@2025-06-01' = {
  name: take('frontdoor-afd-${uniqueString(resourceGroup().id)}', 90)
  location: 'Global'
  sku: {
    name: 'Standard_AzureFrontDoor'
  }
  tags: {
    'aspire-resource-name': 'frontdoor-afd'
  }
}

resource aspiredevEndpoint 'Microsoft.Cdn/profiles/afdEndpoints@2025-06-01' = {
  name: take('aspiredev-${uniqueString(resourceGroup().id)}', 46)
  location: 'Global'
  parent: frontdoor_afd
}

resource aspiredevOriginGroup 'Microsoft.Cdn/profiles/originGroups@2025-06-01' = {
  name: take('aspiredev-og-${uniqueString(resourceGroup().id)}', 90)
  properties: {
    healthProbeSettings: {
      probePath: '/'
      probeProtocol: 'Https'
    }
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
      additionalLatencyInMilliseconds: 50
    }
  }
  parent: frontdoor_afd
}

resource aspiredevOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2025-06-01' = {
  name: take('aspiredev-origin-${uniqueString(resourceGroup().id)}', 90)
  properties: {
    enforceCertificateNameCheck: true
    hostName: aspiredev_host
    originHostHeader: aspiredev_host
    weight: 1000
  }
  parent: aspiredevOriginGroup
}

resource aspiredevRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2025-06-01' = {
  name: take('aspiredev-route-${uniqueString(resourceGroup().id)}', 90)
  properties: {
    cacheConfiguration: {
      queryStringCachingBehavior: 'IgnoreQueryString'
      compressionSettings: {
        contentTypesToCompress: [
          'text/plain'
          'text/html'
          'text/css'
          'application/javascript'
          'application/json'
          'image/svg+xml'
        ]
        isCompressionEnabled: true
      }
    }
    forwardingProtocol: 'HttpsOnly'
    httpsRedirect: 'Enabled'
    linkToDefaultDomain: 'Enabled'
    originGroup: {
      id: aspiredevOriginGroup.id
    }
    patternsToMatch: [
      '/*'
    ]
  }
  parent: aspiredevEndpoint
  dependsOn: [
    aspiredevOrigin
  ]
}

output aspiredev_endpointUrl string = 'https://${aspiredevEndpoint.properties.hostName}'