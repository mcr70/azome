# Log Analytics Workspace for Application Insights
resource "azurerm_log_analytics_workspace" "law" {
  name                = "law-lab"
  resource_group_name = azurerm_resource_group.rg_app.name
  location            = azurerm_resource_group.rg_app.location
  sku                 = "PerGB2018"
  retention_in_days   = 30

  daily_quota_gb      = 0.1 // Stays withing the free 5 GB / Month free log quota
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

resource "azurerm_monitor_data_collection_rule" "dcr_storage" {
  name                = "dcr-${var.sa_name}"
  resource_group_name = azurerm_resource_group.rg_app.name
  location            = azurerm_resource_group.rg_app.location

  # Jätetään data_sources pois, jos sitä ei vaadita välittömästi, 
  # tai määritellään pelkkä tyhjä/yleinen rakenne, jotta validointi menee läpi.
  destinations {
    log_analytics {
      workspace_resource_id = azurerm_log_analytics_workspace.law.id
      name                  = "law-destination"
    }
  }

  data_flow {
    streams      = ["Microsoft-InsightsMetrics"]
    destinations = ["law-destination"]
  }
}

resource "azurerm_monitor_data_collection_rule_association" "dcra_storage" {
  name                    = "dcra-${var.sa_name}"
  target_resource_id      = azurerm_storage_account.sa_func.id
  data_collection_rule_id = azurerm_monitor_data_collection_rule.dcr_storage.id
}