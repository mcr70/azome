# Azome UI

An Angular single-page application (SPA) for interacting with Azure Resource Manager and Microsoft Graph APIs.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer)
- [Angular CLI](https://angular.dev/tools/cli) (`npm install -g @angular/cli`)
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)
- [Terraform](https://developer.hashicorp.com/terraform/downloads) (v1.5 or newer)

---

## Quick Start

### 1. Azure Login

Authenticate with Azure CLI using an account that has privileges to manage Azure subscriptions and Entra ID application registrations:

```
az login
```

### 2. Infrastructure Setup (Terraform)

Initialize and apply the Terraform configuration to provision the Azure Resource Group, Static Web Storage, Entra ID App Registration, and API permissions. Check main.tf for backend configuration

terraform folder has a [README.md](terraform/README.md), that shows
how to create a storage account for terraform state. 

```
terraform init
terraform apply
```

> Note on Admin Consent:
  Terraform automatically grants admin consent for delegated API permissions (User.Read and user_impersonation). For production environments, review whether automated admin consent aligns with your organization's security and approval policies.

### 3. Application Configuration

Copy the JSON output printed by terraform apply into src/environments/environment.ts:

```
export const environment = {
  production: false,
  azure: {
    clientId: '<clientId-from-terraform-output>',
    subscriptionId: '<subscriptionId-from-terraform-output>',
    tenantId: '<tenantId-from-terraform-output>',
    resourceManagerUrl: '[https://management.azure.com](https://management.azure.com)',
    apiVersion: '2021-04-01'
  }
};
```

### 4. Install and start the server

```
npm install
ng serve
```