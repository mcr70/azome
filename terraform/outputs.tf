# Output matching src/environments/environment.ts
output "environment" {
  value = {
    info = "Copy these values into src/environments/environment.ts file"
    azure = {
      clientId           = azuread_application.azome.client_id
      subscriptionId     = data.azurerm_client_config.current.subscription_id
      tenantId           = data.azurerm_client_config.current.tenant_id
      resourceManagerUrl = "https://management.azure.com"
      proxyUrl           = "https://${azurerm_linux_web_app.azome_proxy.default_hostname}"
      apiVersion         = "2021-04-01"
    }
  }
  description = "Angular environment configuration"
}

output "angular_website_url" {
  value       = azurerm_storage_account.azome_storage.primary_web_endpoint
  description = "The production URL of your Angular application"
}

output "storage_proxy_url" {
  value       = "https://${azurerm_linux_web_app.azome_proxy.default_hostname}"
  description = "The HTTPS URL of the Storage and Cosmos data proxy"
}

output "storage_proxy_app_name" {
  value       = azurerm_linux_web_app.azome_proxy.name
  description = "The Azure Web App name used to deploy the Storage and Cosmos proxy"
}

output "storage_account_name" {
  value       = azurerm_storage_account.azome_storage.name
  description = "The Storage account name used to publish the Angular application"
}
