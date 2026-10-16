# Azome UI

Azome is an Angular single-page application for exploring Azure resources through
Azure Resource Manager and Microsoft Graph. Terraform provisions static website
hosting, the Entra ID application registration, and a small Node.js data proxy.

## Prerequisites

- Node.js 20 or newer and npm
- Azure CLI
- Terraform 1.5 or newer
- An Azure subscription and an Entra ID account allowed to create app registrations

## Deploy to Azure

### 1. Sign in and select a subscription

```bash
az login
az account set --subscription <subscription-id>
```

Terraform stores its state in an Azure Storage backend. Create that backend once,
or use an existing one, following [terraform/README.md](terraform/README.md). The
backend settings in `terraform/main.tf` must match the account and container you
use.

### 2. Provision Azure resources

```bash
terraform -chdir=terraform init
terraform -chdir=terraform apply
```

Terraform creates the `rg-azome` resource group, the `saazome` static website
storage account, an Entra ID application registration with delegated permissions,
and an F1 Linux App Service for the Storage and Cosmos proxy. The F1 plan is the
Azure free tier; availability and free-tier quotas depend on the subscription
and region.

Terraform grants admin consent for the configured delegated permissions. This
requires suitable Entra ID privileges. Users also need Azure RBAC access to the
subscription or resource groups they want to view.

### 3. Configure and build the Angular app

Set the `proxyUrl` property in `src/environments/environment.ts` to the value
printed by:

```bash
terraform -chdir=terraform output -raw storage_proxy_url
```

The other Azure settings are printed by `terraform -chdir=terraform output
environment`. Use those values for `clientId`, `subscriptionId`, and `tenantId`.
Then build the production bundle:

```bash
npm ci
npm run build
```

The static website files are written to `dist/azome/browser`.

### 4. Deploy the proxy and website

Package and deploy the Node.js proxy:

```bash
zip -j /tmp/azome-proxy.zip scripts/storage-proxy.mjs
az webapp deploy \
  --resource-group rg-azome \
  --name "$(terraform -chdir=terraform output -raw storage_proxy_app_name)" \
  --src-path /tmp/azome-proxy.zip \
  --type zip
```

Publish the Angular files to the Storage static website:

```bash
az storage blob upload-batch \
  --auth-mode login \
  --account-name "$(terraform -chdir=terraform output -raw storage_account_name)" \
  --destination '$web' \
  --source dist/azome/browser \
  --overwrite
```

The signed-in Azure identity needs the **Storage Blob Data Contributor** role on
the website Storage account to upload the site. Terraform outputs the public
website URL as `angular_website_url`:

```bash
terraform -chdir=terraform output -raw angular_website_url
```

The proxy only accepts browser requests from that configured website origin.
Its `/health` endpoint can be used to check that the deployed process is running.

For proxy behavior, supported routes, local development, and current network
limitations, see [README-proxy.md](README-proxy.md).
