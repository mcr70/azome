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
  name                = var.func_name
  resource_group_name = azurerm_resource_group.rg_app.name
  location            = azurerm_resource_group.rg_app.location
  service_plan_id     = azurerm_service_plan.plan_func.id

  # storage account
  storage_account_name       = azurerm_storage_account.sa_func.name
  storage_account_access_key = azurerm_storage_account.sa_func.primary_access_key

  site_config {
    application_stack {
      node_version = "20"
    }
  }

  app_settings = {
    "FUNCTIONS_WORKER_RUNTIME" = "node"
    "AzureWebJobsFeatureFlags" = "EnableWorkerIndexing"
    # Kertoo Azurelle, että funktiot löytyvät suoraan index.js -tiedostosta tai projektin juuresta
    "scriptRoot" = ""
  }

  tags = {
    azome-apps = "sample" // azome-apps marks this as being part of app called "sample"
  }

  lifecycle { // Handle deployment manually, Terraform should not interfere
    ignore_changes = [
      app_settings
    ]
  }
}

# Free Linux App Service used to test application console log streaming.
resource "azurerm_service_plan" "plan_web" {
  name                = "plan-azome-test-web-f1"
  resource_group_name = azurerm_resource_group.rg_app.name
  location            = azurerm_resource_group.rg_app.location
  os_type             = "Linux"
  sku_name            = "F1"
}

resource "azurerm_linux_web_app" "web" {
  name                = var.web_app_name
  resource_group_name = azurerm_resource_group.rg_app.name
  location            = azurerm_resource_group.rg_app.location
  service_plan_id     = azurerm_service_plan.plan_web.id
  https_only          = true

  site_config {
    always_on        = false
    app_command_line = "npm start"

    application_stack {
      node_version = "20-lts"
    }
  }

  app_settings = {
    "SCM_DO_BUILD_DURING_DEPLOYMENT" = "false"
  }

  logs {
    application_logs {
      file_system_level = "Information"
    }
  }

  tags = {
    azome-apps = "sample"
  }
}

resource "azurerm_monitor_diagnostic_setting" "web_diag" {
  name                       = "diag-${var.web_app_name}"
  target_resource_id         = azurerm_linux_web_app.web.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.law.id

  enabled_log {
    category = "AppServiceConsoleLogs"
  }
}
