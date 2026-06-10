# 1. Create a Resource Group for the Angular SPA application
resource "azurerm_resource_group" "azome_rg" {
  name     = "rg-azome"
  location = "westeurope"
}

# 2. Create the Storage Account for static website hosting
resource "azurerm_storage_account" "azome_storage" {
  name                     = "saazome" # Must be globally unique
  resource_group_name      = azurerm_resource_group.azome_rg.name
  location                 = azurerm_resource_group.azome_rg.location
  account_tier             = "Standard"
  account_replication_type = "LRS"

  static_website {
    index_document     = "index.html"
    error_404_document = "index.html" # Fallback for Angular router
  }
}

# 3. Create the Entra ID Application Registration for the Angular SPA
resource "azuread_application" "azome" {
  display_name     = "angular-spa-prod"
  sign_in_audience = "AzureADMyOrg"

  single_page_application {
    redirect_uris = [
      "http://localhost:4200/", 
      "http://localhost:4200/auth-blank.html",
      azurerm_storage_account.azome_storage.primary_web_endpoint
    ]
  }

  required_resource_access {
    resource_app_id = "00000003-0000-0000-c000-000000000000" # Microsoft Graph API

    resource_access {
      id   = "e1fe6dd8-ba31-4d61-89e7-88639da4683d" # User.Read
      type = "Scope"
    }
  }
}

# 4. Create a Service Principal
resource "azuread_service_principal" "azome_sp" {
  client_id                    = azuread_application.azome.client_id
  app_role_assignment_required = false
}

