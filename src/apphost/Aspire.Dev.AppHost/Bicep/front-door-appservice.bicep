param frontDoorName string
param appServiceHostName string

@description('Location for all resources, needed because Aspire always injects a location parameter')
param location string = resourceGroup().location

@description('Rate limit threshold value for rate limit custom rule (requests per 5 minutes)')
param rateLimitThreshold int = 500

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

// WAF Policy for DDoS compliance
resource wafPolicy 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies@2025-03-01' = {
  name: take('${frontDoorName}-waf-AppDDoS${uniqueString(resourceGroup().id)}', 128)
  location: 'Global'
  sku: {
    name: 'Premium_AzureFrontDoor'
  }
  properties: {
    policySettings: {
      enabledState: 'Enabled'
      mode: 'Detection'
      customBlockResponseStatusCode: 403
      requestBodyCheck: 'Enabled'
      javascriptChallengeExpirationInMinutes: 30
    }
    customRules: {
      rules: [
        {
          name: 'GlobalRateLimitRule'
          enabledState: 'Enabled'
          priority: 100
          ruleType: 'RateLimitRule'
          rateLimitDurationInMinutes: 5
          rateLimitThreshold: rateLimitThreshold
          matchConditions: [
            {
              matchVariable: 'RequestUri'
              operator: 'Contains'
              negateCondition: false
              matchValue: [
                '/'
              ]
              transforms: []
            }
          ]
          action: 'Block'
        }
      ]
    }
    managedRules: {
      managedRuleSets: [
        {
          ruleSetType: 'Microsoft_BotManagerRuleSet'
          ruleSetVersion: '1.1'
          ruleGroupOverrides: []
          exclusions: []
        }
      ]
    }
  }
}

// Security policy to associate WAF with Front Door endpoint
resource securityPolicy 'Microsoft.Cdn/profiles/securityPolicies@2025-06-01' = {
  parent: frontDoorProfile
  name: take('${frontDoorName}-AppDDoS${uniqueString(resourceGroup().id)}', 260)
  properties: {
    parameters: {
      type: 'WebApplicationFirewall'
      wafPolicy: {
        id: wafPolicy.id
      }
      associations: [
        {
          domains: [
            {
              id: frontDoorEndpoint.id
            }
          ]
          patternsToMatch: [
            '/*'
          ]
        }
      ]
    }
  }
}
