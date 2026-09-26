# Fetch well-known application IDs published by Microsoft
data "azuread_application_published_app_ids" "well_known" {}

# Fetch Microsoft Graph Service Principal
data "azuread_service_principal" "msgraph" {
  client_id = data.azuread_application_published_app_ids.well_known.result.MicrosoftGraph
}

# Fetch Azure Resource Manager Service Principal
data "azuread_service_principal" "azure_mgmt" {
  client_id = data.azuread_application_published_app_ids.well_known.result.AzureResourceManager
}

# Resource Group for the Angular SPA application
resource "azurerm_resource_group" "azome_rg" {
  name     = "rg-azome"
  location = "westeurope"
}

# Storage Account for static website hosting
resource "azurerm_storage_account" "azome_storage" {
  name                     = "saazome"
  resource_group_name      = azurerm_resource_group.azome_rg.name
  location                 = azurerm_resource_group.azome_rg.location
  account_tier             = "Standard"
  account_replication_type = "LRS"

  static_website {
    index_document     = "index.html"
    error_404_document = "index.html"
  }
}

# Entra ID Application Registration for the Angular SPA
resource "azuread_application" "azome" {
  display_name     = "Azome UI"
  sign_in_audience = "AzureADMyOrg"

  single_page_application {
    redirect_uris = [
      "http://localhost:4100/",
      "http://localhost:4100/auth-blank.html",
      azurerm_storage_account.azome_storage.primary_web_endpoint
    ]
  }

  # Microsoft Graph API permissions
  required_resource_access {
    resource_app_id = data.azuread_application_published_app_ids.well_known.result.MicrosoftGraph

    resource_access {
      id   = data.azuread_service_principal.msgraph.oauth2_permission_scope_ids["User.Read"] # User.Read
      type = "Scope"
    }
  }

  # Azure Service Management (ARM) permissions
  required_resource_access {
    resource_app_id = data.azuread_application_published_app_ids.well_known.result.AzureResourceManager

    resource_access {
      id   = data.azuread_service_principal.azure_mgmt.oauth2_permission_scope_ids["user_impersonation"] # user_impersonation
      type = "Scope"
    }
  }
}

# Service Principal for the application
resource "azuread_service_principal" "azome_sp" {
  client_id                    = azuread_application.azome.client_id
  app_role_assignment_required = false
}

# Automatic Admin Consent (Grant OAuth2 delegated permissions)

# Admin consent for Microsoft Graph (User.Read)
resource "azuread_service_principal_delegated_permission_grant" "msgraph_consent" {
  service_principal_object_id          = azuread_service_principal.azome_sp.object_id
  resource_service_principal_object_id = data.azuread_service_principal.msgraph.object_id
  claim_values                         = ["User.Read"]
}

# Admin consent for Azure Service Management (user_impersonation)
resource "azuread_service_principal_delegated_permission_grant" "azure_mgmt_consent" {
  service_principal_object_id          = azuread_service_principal.azome_sp.object_id
  resource_service_principal_object_id = data.azuread_service_principal.azure_mgmt.object_id
  claim_values                         = ["user_impersonation"]
}