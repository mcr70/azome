# Configure the Terraform backend to store state in Azure Blob Storage
# Note: Always use English for Terraform resource names and comments.

terraform {
  required_providers {
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.50"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }

  # Backend configuration pointing to your freshly created storage container
  backend "azurerm" {
    resource_group_name  = "rg-terraform-meta"
    storage_account_name = "azometfstate"
    container_name       = "tfstate"
    key                  = "azome.tfstate"
  }
}

provider "azuread" {}

provider "azurerm" {
  features {}
}

