# Log Analytics Workspace for Application Insights
resource "azurerm_log_analytics_workspace" "law" {
  name                = "law-lab"
  resource_group_name = azurerm_resource_group.rg_app.name
  location            = azurerm_resource_group.rg_app.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

# Diagnostic setting to send Function App logs to Log Analytics Workspace
resource "azurerm_monitor_diagnostic_setting" "func_diag" {
  name                       = "diag-${var.func_name}"
  target_resource_id         = azurerm_linux_function_app.func.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.law.id

  # Function App logs
  enabled_log {
    category = "FunctionAppLogs"
  }
}