# Coding
When creating code, if comments are added use always English as a language.

# Services
- `src/app/services` folder contains all the services.
- Azure-specific services are in the `azure` subfolder.
- `azome` non-Azure services are in the `azome` subfolder.

> **Rule:** Prefer using Microsoft Graph API over other APIs whenever possible.

# Components

## Resource Details
- Azure resource detail components are located in `src/app/components/resource-details`.
- Each resource detail component **must** be registered in `ResourceDetailRegistryService`.
- Resource detail views should focus on displaying essential information. Omit unnecessary details if they don't add value (a full JSON view is available for inspecting complete raw data).

## Other Components
- Keep common/general components separate from resource detail components. Do not mix them in the same directories.

# Perspectives
- Perspectives are located in the `src/app/perspectives` folder.
- Each perspective provides its own targeted view of Azure resources.
- Currently, perspective routing and selection are handled in `app.routes.ts` and `app.component.ts`.

# Terraform
Terraform code is in `terraform/` folder. It is intented to provide a simple setup to create necessary Azure resources to be used with azome.

There are also `terraform/*-lab/ folders, which are used to test different azure resources.
Idea is to use free versions of those resources. 

> **Rule:** If there is a cost involved, always ask before creating such Terraform code.

Each lab should be self-contained, but Terraform state should be placed in the same
Storage account, with lab specific key, like in here for networking-lab:

```
  backend "azurerm" {
    resource_group_name  = "rg-terraform-meta"
    storage_account_name = "azomelabtfstate"
    container_name       = "labtfstate"
    key                  = "networking.tfstate"
  }  
```