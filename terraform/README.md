# Terraform setup

```bash
az group create --name rg-terraform-meta --location westeurope

az storage account create --name azometfstate --resource-group rg-terraform-meta --sku Standard_LRS --encryption-services blob 

az storage container create --name tfstate --account-name azometfstate
```

# Azure Configuration & Setup Guide
To run this application and successfully interact with Azure APIs, follow these steps to configure your Azure Entra ID (formerly Azure AD) application registration.

## API Permissions € Admin consent
The Terraform setup configures the Entra ID application registration with the following delegated permissions:

- Microsoft Graph: `User.Read (Delegated)` - To retrieve user details for the UI

- Azure Service Management: `user_impersonation (Delegated)` - To act on behalf of the signed-in user when making Azure Resource Manager calls

### Automated Admin Consent Notice:

Admin consent for these delegated permissions is granted automatically during terraform apply using `azuread_service_principal_delegated_permission_grant` resources.

> Important for Production Environments:
  Automated admin consent requires high-level privileges (e.g., Application Administrator or Global Administrator) for the executing identity. For production deployments, consider whether automatic consent aligns with your organization's security policies, or if admin consent should be reviewed and granted manually/separately via approval workflows.

### Note on Access Control:

The application operates using the signed-in user's identity. By default, ensure that users (or Entra ID groups) are granted at least the `Reader` role for read-only access, or the `Contributor` role if they need to manage resources. Roles can be assigned at the Resource Group or Subscription level via the Azure Portal or Azure CLI.

## Local Configuration
Create a configuration file at `src/environments/environment.ts` to manage your environment-specific settings. Terraform will print needed values. This ensures the application knows which subscription to target.



## Authentication & Interceptors
The application uses MsalService for authentication and a custom AuthInterceptor to inject the necessary bearer tokens into outgoing HTTP requests.

AuthInterceptor: This service automatically intercepts requests directed to https://management.azure.com and https://graph.microsoft.com.

Token Handling: It uses acquireTokenSilent to retrieve the correct scope (user_impersonation for Azure ARM) before appending the Authorization: Bearer <token> header to the request.

## Troubleshooting
If you encounter 401 Unauthorized errors during development:

Clear Local Storage: Open browser DevTools -> Application -> Local Storage -> Clear all.

Hard Refresh: Use Ctrl+F5 (or Cmd+Shift+R) to ensure no stale tokens remain.

Check Scopes: Verify that your loginRedirect configuration includes https://management.azure.com/user_impersonation in the requested scopes.