terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }

  backend "azurerm" {
    resource_group_name  = "rg-terraform-meta"
    storage_account_name = "azomelabtfstate"
    container_name       = "labtfstate"
    key                  = "data.tfstate"
  }  
}

provider "azurerm" {
  features {}
}

// ----------------------------------------

data "azurerm_client_config" "current" {}

// ----------------------------------------


resource "azurerm_resource_group" "data_lab" {
  name     = var.resource_group_name
  location = var.location

  tags = {
    purpose     = "azome-networking-perspective"
    environment = "lab"
    managed_by  = "terraform"
  }
}


# Standard Storage Account (0 €)
resource "azurerm_storage_account" "data_test" {
  name                     = "stazomedatalab01"
  resource_group_name      = azurerm_resource_group.data_lab.name
  location                 = azurerm_resource_group.data_lab.location
  account_tier             = "Standard"
  account_replication_type = "LRS"

  allow_nested_items_to_be_public = false
}

# Key Vault (0 €)
resource "azurerm_key_vault" "data_test" {
  name                        = "kv-azome-lab-01"
  location                    = azurerm_resource_group.data_lab.location
  resource_group_name         = azurerm_resource_group.data_lab.name
  enabled_for_disk_encryption = true
  tenant_id                   = data.azurerm_client_config.current.tenant_id
  soft_delete_retention_days  = 7
  purge_protection_enabled    = false

  sku_name = "standard"
}

# Cosmos DB Free Tier (0 € / 1 tilaus)
resource "azurerm_cosmosdb_account" "data_test" {
  name                = "cosmos-azome-lab-01"
  location            = azurerm_resource_group.data_lab.location
  resource_group_name = azurerm_resource_group.data_lab.name
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"

  free_tier_enabled = true

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = azurerm_resource_group.data_lab.location
    failover_priority = 0
  }
}