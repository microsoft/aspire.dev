@description('The location for the resource(s) to be deployed.')
param location string = resourceGroup().location

@secure()
param live_public_base_url_value string

@secure()
param live_coalesce_window_ms_value string

@secure()
param live_twitch_client_id_value string

@secure()
param live_twitch_client_secret_value string

@secure()
param live_twitch_webhook_secret_value string

@secure()
param live_twitch_channel_login_value string

@secure()
param live_twitch_channel_id_value string

@secure()
param live_twitch_reconcile_interval_seconds_value string

@secure()
param live_youtube_api_key_value string

@secure()
param live_youtube_webhook_secret_value string

@secure()
param live_youtube_channel_handle_value string

@secure()
param live_youtube_channel_id_value string

@secure()
param live_youtube_polling_interval_seconds_value string

@secure()
param live_youtube_discovery_polling_interval_seconds_value string

@secure()
param live_youtube_offline_confirmation_count_value string

resource live_config 'Microsoft.KeyVault/vaults@2024-11-01' = {
  name: take('liveconfig-${uniqueString(resourceGroup().id)}', 24)
  location: location
  properties: {
    tenantId: tenant().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
  }
  tags: {
    'aspire-resource-name': 'live-config'
  }
}

resource secret_live_public_base_url 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  name: 'live-public-base-url'
  properties: {
    value: live_public_base_url_value
  }
  parent: live_config
}

resource secret_live_coalesce_window_ms 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  name: 'live-coalesce-window-ms'
  properties: {
    value: live_coalesce_window_ms_value
  }
  parent: live_config
}

resource secret_live_twitch_client_id 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  name: 'live-twitch-client-id'
  properties: {
    value: live_twitch_client_id_value
  }
  parent: live_config
}

resource secret_live_twitch_client_secret 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  name: 'live-twitch-client-secret'
  properties: {
    value: live_twitch_client_secret_value
  }
  parent: live_config
}

resource secret_live_twitch_webhook_secret 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  name: 'live-twitch-webhook-secret'
  properties: {
    value: live_twitch_webhook_secret_value
  }
  parent: live_config
}

resource secret_live_twitch_channel_login 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  name: 'live-twitch-channel-login'
  properties: {
    value: live_twitch_channel_login_value
  }
  parent: live_config
}

resource secret_live_twitch_channel_id 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  name: 'live-twitch-channel-id'
  properties: {
    value: live_twitch_channel_id_value
  }
  parent: live_config
}

resource secret_live_twitch_reconcile_interval_seconds 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  name: 'live-twitch-reconcile-interval-seconds'
  properties: {
    value: live_twitch_reconcile_interval_seconds_value
  }
  parent: live_config
}

resource secret_live_youtube_api_key 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  name: 'live-youtube-api-key'
  properties: {
    value: live_youtube_api_key_value
  }
  parent: live_config
}

resource secret_live_youtube_webhook_secret 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  name: 'live-youtube-webhook-secret'
  properties: {
    value: live_youtube_webhook_secret_value
  }
  parent: live_config
}

resource secret_live_youtube_channel_handle 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  name: 'live-youtube-channel-handle'
  properties: {
    value: live_youtube_channel_handle_value
  }
  parent: live_config
}

resource secret_live_youtube_channel_id 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  name: 'live-youtube-channel-id'
  properties: {
    value: live_youtube_channel_id_value
  }
  parent: live_config
}

resource secret_live_youtube_polling_interval_seconds 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  name: 'live-youtube-polling-interval-seconds'
  properties: {
    value: live_youtube_polling_interval_seconds_value
  }
  parent: live_config
}

resource secret_live_youtube_discovery_polling_interval_seconds 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  name: 'live-youtube-discovery-polling-interval-seconds'
  properties: {
    value: live_youtube_discovery_polling_interval_seconds_value
  }
  parent: live_config
}

resource secret_live_youtube_offline_confirmation_count 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  name: 'live-youtube-offline-confirmation-count'
  properties: {
    value: live_youtube_offline_confirmation_count_value
  }
  parent: live_config
}

output vaultUri string = live_config.properties.vaultUri

output name string = live_config.name

output id string = live_config.id