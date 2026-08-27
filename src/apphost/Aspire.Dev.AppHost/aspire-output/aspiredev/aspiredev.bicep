@description('The location for the resource(s) to be deployed.')
param location string = resourceGroup().location

param production_outputs_azure_container_registry_endpoint string

param production_outputs_planid string

param production_outputs_azure_container_registry_managed_identity_id string

param production_outputs_azure_container_registry_managed_identity_client_id string

param aspiredev_containerimage string

param aspiredev_containerport string

param live_config_outputs_vaulturi string

param live_config_outputs_name string

param aspiredev_identity_outputs_id string

param aspiredev_identity_outputs_clientid string

param production_outputs_azure_app_service_dashboard_uri string

param production_outputs_azure_website_contributor_managed_identity_id string

param production_outputs_azure_website_contributor_managed_identity_principal_id string

resource live_config 'Microsoft.KeyVault/vaults@2024-11-01' existing = {
  name: live_config_outputs_name
}

resource live_config_live_public_base_url 'Microsoft.KeyVault/vaults/secrets@2024-11-01' existing = {
  name: 'live-public-base-url'
  parent: live_config
}

resource live_config_live_coalesce_window_ms 'Microsoft.KeyVault/vaults/secrets@2024-11-01' existing = {
  name: 'live-coalesce-window-ms'
  parent: live_config
}

resource live_config_live_twitch_client_id 'Microsoft.KeyVault/vaults/secrets@2024-11-01' existing = {
  name: 'live-twitch-client-id'
  parent: live_config
}

resource live_config_live_twitch_client_secret 'Microsoft.KeyVault/vaults/secrets@2024-11-01' existing = {
  name: 'live-twitch-client-secret'
  parent: live_config
}

resource live_config_live_twitch_webhook_secret 'Microsoft.KeyVault/vaults/secrets@2024-11-01' existing = {
  name: 'live-twitch-webhook-secret'
  parent: live_config
}

resource live_config_live_twitch_channel_login 'Microsoft.KeyVault/vaults/secrets@2024-11-01' existing = {
  name: 'live-twitch-channel-login'
  parent: live_config
}

resource live_config_live_twitch_channel_id 'Microsoft.KeyVault/vaults/secrets@2024-11-01' existing = {
  name: 'live-twitch-channel-id'
  parent: live_config
}

resource live_config_live_twitch_reconcile_interval_seconds 'Microsoft.KeyVault/vaults/secrets@2024-11-01' existing = {
  name: 'live-twitch-reconcile-interval-seconds'
  parent: live_config
}

resource live_config_live_youtube_api_key 'Microsoft.KeyVault/vaults/secrets@2024-11-01' existing = {
  name: 'live-youtube-api-key'
  parent: live_config
}

resource live_config_live_youtube_webhook_secret 'Microsoft.KeyVault/vaults/secrets@2024-11-01' existing = {
  name: 'live-youtube-webhook-secret'
  parent: live_config
}

resource live_config_live_youtube_channel_handle 'Microsoft.KeyVault/vaults/secrets@2024-11-01' existing = {
  name: 'live-youtube-channel-handle'
  parent: live_config
}

resource live_config_live_youtube_channel_id 'Microsoft.KeyVault/vaults/secrets@2024-11-01' existing = {
  name: 'live-youtube-channel-id'
  parent: live_config
}

resource live_config_live_youtube_polling_interval_seconds 'Microsoft.KeyVault/vaults/secrets@2024-11-01' existing = {
  name: 'live-youtube-polling-interval-seconds'
  parent: live_config
}

resource live_config_live_youtube_discovery_polling_interval_seconds 'Microsoft.KeyVault/vaults/secrets@2024-11-01' existing = {
  name: 'live-youtube-discovery-polling-interval-seconds'
  parent: live_config
}

resource live_config_live_youtube_offline_confirmation_count 'Microsoft.KeyVault/vaults/secrets@2024-11-01' existing = {
  name: 'live-youtube-offline-confirmation-count'
  parent: live_config
}

resource mainContainer 'Microsoft.Web/sites/sitecontainers@2025-03-01' = {
  name: 'main'
  properties: {
    authType: 'UserAssigned'
    image: aspiredev_containerimage
    isMain: true
    targetPort: aspiredev_containerport
    userManagedIdentityClientId: production_outputs_azure_container_registry_managed_identity_client_id
  }
  parent: webapp
}

resource webapp 'Microsoft.Web/sites@2025-03-01' = {
  name: take('${toLower('aspiredev')}-${uniqueString(resourceGroup().id)}', 60)
  location: location
  properties: {
    serverFarmId: production_outputs_planid
    keyVaultReferenceIdentity: aspiredev_identity_outputs_id
    siteConfig: {
      numberOfWorkers: 1
      linuxFxVersion: 'SITECONTAINERS'
      acrUseManagedIdentityCreds: true
      acrUserManagedIdentityID: production_outputs_azure_container_registry_managed_identity_client_id
      appSettings: [
        {
          name: 'WEBSITES_PORT'
          value: aspiredev_containerport
        }
        {
          name: 'OTEL_DOTNET_EXPERIMENTAL_OTLP_RETRY'
          value: 'in_memory'
        }
        {
          name: 'ASPNETCORE_FORWARDEDHEADERS_ENABLED'
          value: 'true'
        }
        {
          name: 'HTTP_PORTS'
          value: aspiredev_containerport
        }
        {
          name: 'ConnectionStrings__live-config'
          value: live_config_outputs_vaulturi
        }
        {
          name: 'LIVE_CONFIG_URI'
          value: live_config_outputs_vaulturi
        }
        {
          name: 'Live__PublicBaseUrl'
          value: '@Microsoft.KeyVault(SecretUri=${live_config_live_public_base_url.properties.secretUri})'
        }
        {
          name: 'Live__CoalesceWindowMs'
          value: '@Microsoft.KeyVault(SecretUri=${live_config_live_coalesce_window_ms.properties.secretUri})'
        }
        {
          name: 'Live__Twitch__ClientId'
          value: '@Microsoft.KeyVault(SecretUri=${live_config_live_twitch_client_id.properties.secretUri})'
        }
        {
          name: 'Live__Twitch__ClientSecret'
          value: '@Microsoft.KeyVault(SecretUri=${live_config_live_twitch_client_secret.properties.secretUri})'
        }
        {
          name: 'Live__Twitch__WebhookSecret'
          value: '@Microsoft.KeyVault(SecretUri=${live_config_live_twitch_webhook_secret.properties.secretUri})'
        }
        {
          name: 'Live__Twitch__ChannelLogin'
          value: '@Microsoft.KeyVault(SecretUri=${live_config_live_twitch_channel_login.properties.secretUri})'
        }
        {
          name: 'Live__Twitch__ChannelId'
          value: '@Microsoft.KeyVault(SecretUri=${live_config_live_twitch_channel_id.properties.secretUri})'
        }
        {
          name: 'Live__Twitch__ReconcileIntervalSeconds'
          value: '@Microsoft.KeyVault(SecretUri=${live_config_live_twitch_reconcile_interval_seconds.properties.secretUri})'
        }
        {
          name: 'Live__YouTube__ApiKey'
          value: '@Microsoft.KeyVault(SecretUri=${live_config_live_youtube_api_key.properties.secretUri})'
        }
        {
          name: 'Live__YouTube__WebhookSecret'
          value: '@Microsoft.KeyVault(SecretUri=${live_config_live_youtube_webhook_secret.properties.secretUri})'
        }
        {
          name: 'Live__YouTube__ChannelHandle'
          value: '@Microsoft.KeyVault(SecretUri=${live_config_live_youtube_channel_handle.properties.secretUri})'
        }
        {
          name: 'Live__YouTube__ChannelId'
          value: '@Microsoft.KeyVault(SecretUri=${live_config_live_youtube_channel_id.properties.secretUri})'
        }
        {
          name: 'Live__YouTube__PollingIntervalSeconds'
          value: '@Microsoft.KeyVault(SecretUri=${live_config_live_youtube_polling_interval_seconds.properties.secretUri})'
        }
        {
          name: 'Live__YouTube__DiscoveryPollingIntervalSeconds'
          value: '@Microsoft.KeyVault(SecretUri=${live_config_live_youtube_discovery_polling_interval_seconds.properties.secretUri})'
        }
        {
          name: 'Live__YouTube__OfflineConfirmationCount'
          value: '@Microsoft.KeyVault(SecretUri=${live_config_live_youtube_offline_confirmation_count.properties.secretUri})'
        }
        {
          name: 'AZURE_CLIENT_ID'
          value: aspiredev_identity_outputs_clientid
        }
        {
          name: 'AZURE_TOKEN_CREDENTIALS'
          value: 'ManagedIdentityCredential'
        }
        {
          name: 'ASPIRE_ENVIRONMENT_NAME'
          value: 'production'
        }
        {
          name: 'OTEL_SERVICE_NAME'
          value: 'aspiredev'
        }
        {
          name: 'OTEL_EXPORTER_OTLP_PROTOCOL'
          value: 'grpc'
        }
        {
          name: 'OTEL_EXPORTER_OTLP_ENDPOINT'
          value: 'http://localhost:6001'
        }
        {
          name: 'WEBSITE_ENABLE_ASPIRE_OTEL_SIDECAR'
          value: 'true'
        }
        {
          name: 'OTEL_COLLECTOR_URL'
          value: production_outputs_azure_app_service_dashboard_uri
        }
        {
          name: 'OTEL_CLIENT_ID'
          value: production_outputs_azure_container_registry_managed_identity_client_id
        }
      ]
    }
  }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${production_outputs_azure_container_registry_managed_identity_id}': { }
      '${aspiredev_identity_outputs_id}': { }
    }
  }
}

resource aspiredev_website_ra 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(webapp.id, production_outputs_azure_website_contributor_managed_identity_id, subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'de139f84-1756-47ae-9be6-808fbbe84772'))
  properties: {
    principalId: production_outputs_azure_website_contributor_managed_identity_principal_id
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'de139f84-1756-47ae-9be6-808fbbe84772')
    principalType: 'ServicePrincipal'
  }
  scope: webapp
}

resource slotConfigNames 'Microsoft.Web/sites/config@2025-03-01' = {
  name: 'slotConfigNames'
  properties: {
    appSettingNames: [
      'OTEL_SERVICE_NAME'
    ]
  }
  parent: webapp
}