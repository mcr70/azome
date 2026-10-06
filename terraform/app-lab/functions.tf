# Storage Account
resource "azurerm_storage_account" "sa_func" {
  name                     = var.sa_name
  resource_group_name      = azurerm_resource_group.rg_app.name
  location                 = azurerm_resource_group.rg_app.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
}

# Consumption Plan (Y1 - Free)
# https://learn.microsoft.com/en-us/answers/questions/1345601/what-is-function-app-pricing-y1-means
resource "azurerm_service_plan" "plan_func" {
  name                = "plan-azome-test-func"
  resource_group_name = azurerm_resource_group.rg_app.name
  location            = azurerm_resource_group.rg_app.location
  os_type             = "Linux"
  sku_name            = "Y1"
}


# Function App, using the zip file and given storage account
resource "azurerm_linux_function_app" "func" {
  name                       = var.func_name
  resource_group_name        = azurerm_resource_group.rg_app.name
  location                   = azurerm_resource_group.rg_app.location
  service_plan_id            = azurerm_service_plan.plan_func.id

  # storage account
  storage_account_name       = azurerm_storage_account.sa_func.name
  storage_account_access_key = azurerm_storage_account.sa_func.primary_access_key

  site_config {
    application_stack {
      node_version = "20"
    }
  }

  lifecycle { // Handle deployment manually, Terraform should not interfere
    ignore_changes = [
      app_settings,
    ]
  }  
}