terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = ">= 4.2.0, < 5.0.0"
    }
  }

  backend "azurerm" {
    resource_group_name  = "rg-terraform-meta"
    storage_account_name = "azomelabtfstate"
    container_name       = "labtfstate"
    key                  = "networking.tfstate"
  }  
}

provider "azurerm" {
  features {}
}

resource "azurerm_resource_group" "networking_lab" {
  name     = var.resource_group_name
  location = var.location

  tags = {
    purpose     = "azome-networking-perspective"
    environment = "lab"
    managed_by  = "terraform"
  }
}
