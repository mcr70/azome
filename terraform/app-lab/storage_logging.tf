# Diagnostic setting to send Storage Account logs to Log Analytics Workspace
resource "azurerm_monitor_diagnostic_setting" "storage_diag" {
  name                       = "diag-${var.sa_name}"
  target_resource_id         = azurerm_storage_account.sa_func.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.law.id

  # Storage Blob logs (read/write operations)
  enabled_log {
    category = "StorageBlobLogs"
  }

  # Optional: you can also enable additional categories such as "StorageRead", "StorageWrite" if needed
  # enabled_log {
  #   category = "StorageRead"
  # }
  # enabled_log {
  #   category = "StorageWrite"
  # }
}

