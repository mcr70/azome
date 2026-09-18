# Output matching src/environments/environment.ts
output "environment" {
  value = {
    info = "Copy these values into src/environments/environment.ts file"
    azure = {
      clientId           = azuread_application.azome.client_id
      subscriptionId     = data.azurerm_client_config.current.subscription_id
      tenantId           = data.azurerm_client_config.current.tenant_id
      resourceManagerUrl = "https://management.azure.com"
      apiVersion         = "2021-04-01"
    }
  }
  description = "Angular environment configuration"
}

output "angular_website_url" {
  value       = azurerm_storage_account.azome_storage.primary_web_endpoint
  description = "The production URL of your Angular application"
}