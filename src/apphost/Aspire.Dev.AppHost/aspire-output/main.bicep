targetScope = 'subscription'

param resourceGroupName string

param location string

param principalId string

param live_public_base_url string = 'https://aspire.dev'

param live_coalesce_window_ms string = '750'

@secure()
param live_twitch_client_id string

@secure()
param live_twitch_client_secret string

@secure()
param live_twitch_webhook_secret string

param live_twitch_channel_login string = 'aspiredotdev'

param live_twitch_channel_id string

param live_twitch_reconcile_interval_seconds string = '1800'

@secure()
param live_youtube_api_key string

@secure()
param live_youtube_webhook_secret string

param live_youtube_channel_handle string = '@aspiredotdev'

param live_youtube_channel_id string

param live_youtube_polling_interval_seconds string = '120'

param live_youtube_discovery_polling_interval_seconds string = '1800'

param live_youtube_offline_confirmation_count string = '2'

resource rg 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: resourceGroupName
  location: location
}

module production_acr 'production-acr/production-acr.bicep' = {
  name: 'production-acr'
  scope: rg
  params: {
    location: location
  }
}

module production 'production/production.bicep' = {
  name: 'production'
  scope: rg
  params: {
    location: location
    production_acr_outputs_name: production_acr.outputs.name
    userPrincipalId: principalId
  }
}

module frontdoor_afd 'frontdoor-afd/frontdoor-afd.bicep' = {
  name: 'frontdoor-afd'
  scope: rg
  params: {
    location: location
    aspiredev_host: 'aspiredev-${production.outputs.webSiteSuffix}.azurewebsites.net'
  }
}

module live_config 'live-config/live-config.bicep' = {
  name: 'live-config'
  scope: rg
  params: {
    location: location
    live_public_base_url_value: live_public_base_url
    live_coalesce_window_ms_value: live_coalesce_window_ms
    live_twitch_client_id_value: live_twitch_client_id
    live_twitch_client_secret_value: live_twitch_client_secret
    live_twitch_webhook_secret_value: live_twitch_webhook_secret
    live_twitch_channel_login_value: live_twitch_channel_login
    live_twitch_channel_id_value: live_twitch_channel_id
    live_twitch_reconcile_interval_seconds_value: live_twitch_reconcile_interval_seconds
    live_youtube_api_key_value: live_youtube_api_key
    live_youtube_webhook_secret_value: live_youtube_webhook_secret
    live_youtube_channel_handle_value: live_youtube_channel_handle
    live_youtube_channel_id_value: live_youtube_channel_id
    live_youtube_polling_interval_seconds_value: live_youtube_polling_interval_seconds
    live_youtube_discovery_polling_interval_seconds_value: live_youtube_discovery_polling_interval_seconds
    live_youtube_offline_confirmation_count_value: live_youtube_offline_confirmation_count
  }
}

module aspiredev_identity 'aspiredev-identity/aspiredev-identity.bicep' = {
  name: 'aspiredev-identity'
  scope: rg
  params: {
    location: location
  }
}

module aspiredev_roles_live_config 'aspiredev-roles-live-config/aspiredev-roles-live-config.bicep' = {
  name: 'aspiredev-roles-live-config'
  scope: rg
  params: {
    location: location
    live_config_outputs_name: live_config.outputs.name
    principalId: aspiredev_identity.outputs.principalId
  }
}

output production_AZURE_CONTAINER_REGISTRY_ENDPOINT string = production.outputs.AZURE_CONTAINER_REGISTRY_ENDPOINT

output production_planId string = production.outputs.planId

output production_AZURE_CONTAINER_REGISTRY_MANAGED_IDENTITY_ID string = production.outputs.AZURE_CONTAINER_REGISTRY_MANAGED_IDENTITY_ID

output production_AZURE_CONTAINER_REGISTRY_MANAGED_IDENTITY_CLIENT_ID string = production.outputs.AZURE_CONTAINER_REGISTRY_MANAGED_IDENTITY_CLIENT_ID

output live_config_vaultUri string = live_config.outputs.vaultUri

output live_config_name string = live_config.outputs.name

output aspiredev_identity_id string = aspiredev_identity.outputs.id

output aspiredev_identity_clientId string = aspiredev_identity.outputs.clientId

output production_AZURE_APP_SERVICE_DASHBOARD_URI string = production.outputs.AZURE_APP_SERVICE_DASHBOARD_URI

output production_AZURE_WEBSITE_CONTRIBUTOR_MANAGED_IDENTITY_ID string = production.outputs.AZURE_WEBSITE_CONTRIBUTOR_MANAGED_IDENTITY_ID

output production_AZURE_WEBSITE_CONTRIBUTOR_MANAGED_IDENTITY_PRINCIPAL_ID string = production.outputs.AZURE_WEBSITE_CONTRIBUTOR_MANAGED_IDENTITY_PRINCIPAL_ID