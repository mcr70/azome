# Outputs for Angular configuration
output "angular_client_id" {
  value       = azuread_application.azome.client_id
  description = "The Application (client) ID for the Angular app"
}

output "angular_website_url" {
  value       = azurerm_storage_account.azome_storage.primary_web_endpoint
  description = "The production URL of your Angular application"
}