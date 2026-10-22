output "web_app_name" {
  value       = azurerm_linux_web_app.web.name
  description = "The name of the Linux Web App used for log streaming tests"
}

output "web_app_url" {
  value       = "https://${azurerm_linux_web_app.web.default_hostname}"
  description = "The HTTPS URL of the Linux Web App used for log streaming tests"
}
