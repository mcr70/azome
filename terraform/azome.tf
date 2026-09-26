# Create a Resource Group for the Angular SPA application
resource "azurerm_resource_group" "azome_rg" {
  name     = "rg-azome"
  location = "westeurope"
}

# Storage Account for static website hosting
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

# Entra ID Application Registration for the Angular SPA
resource "azuread_application" "azome" {
  display_name     = "angular-spa-prod"
  sign_in_audience = "AzureADMyOrg"

  app_role {
    allowed_member_types = ["User"]
    description          = "Read-only access to the Azome application"
    display_name         = "Azome Reader"
    enabled              = true
    id                   = random_uuid.azome_reader_role.result # Generated once and stored in Terraform state.
    value                = "Azome.Reader"
  }

  app_role {
    allowed_member_types = ["User"]
    description          = "Contributor access to the Azome application"
    display_name         = "Azome Contributor"
    enabled              = true
    id                   = random_uuid.azome_contributor_role.result # Generated once and stored in Terraform state.
    value                = "Azome.Contributor"
  }

  single_page_application {
    redirect_uris = [
      "http://localhost:4100/",
      "http://localhost:4100/auth-blank.html",
      azurerm_storage_account.azome_storage.primary_web_endpoint
    ]
  }

  required_resource_access {
    resource_app_id = "00000003-0000-0000-c000-000000000000" # Microsoft Graph API

    resource_access { # Allow reading user profile information
      id   = "e1fe6dd8-ba31-4d61-89e7-88639da4683d" # User.Read
      type = "Scope"
    }
  }

  required_resource_access {
    resource_app_id = "797f3746-1b2b-42e1-a6e6-97b42b5f28d2" # Azure Resource Manager

    resource_access { # Allow user impersonation for Azure Resource Manager
      id   = "41770d35-0801-4edb-8a1e-828153240280" # user_impersonation (Delegated)
      type = "Scope"
    }
  }  
}

resource "random_uuid" "azome_reader_role" {}

resource "random_uuid" "azome_contributor_role" {}

# Service Principal
resource "azuread_service_principal" "azome_sp" {
  client_id                    = azuread_application.azome.client_id
  app_role_assignment_required = true
}


# Entra groups and permissions
# Assign users to these groups in Entra ID. The groups gate application access.
resource "azuread_group" "azome_reader" {
  display_name     = "azome-reader"
  security_enabled = true
}

resource "azurerm_role_assignment" "azome_reader_subscription" {
  // Grant Reader role to whole subscrption. Limit this if needed
  scope                = "/subscriptions/${data.azurerm_client_config.current.subscription_id}"
  role_definition_name = "Reader"
  principal_id         = azuread_group.azome_reader.object_id
}

resource "azuread_group" "azome_contributor" {
  display_name     = "azome-contributor"
  security_enabled = true
}

resource "azurerm_role_assignment" "azome_contributor_rg" {
  // Grant Contributor role to whole subscrption. Limit this if needed
  scope                = azurerm_resource_group.azome_rg.id
  role_definition_name = "Contributor"
  principal_id         = azuread_group.azome_contributor.object_id
}


# Bind groups to app roles
resource "azuread_app_role_assignment" "azome_reader" {
  app_role_id         = random_uuid.azome_reader_role.result
  principal_object_id = azuread_group.azome_reader.object_id
  resource_object_id  = azuread_service_principal.azome_sp.object_id
}

resource "azuread_app_role_assignment" "azome_contributor" {
  app_role_id         = random_uuid.azome_contributor_role.result
  principal_object_id = azuread_group.azome_contributor.object_id
  resource_object_id  = azuread_service_principal.azome_sp.object_id
}
