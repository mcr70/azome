# Azome UI

Azome is an Angular single-page application for exploring Azure resources through
Azure Resource Manager and Microsoft Graph. Terraform provisions static website
hosting, the Entra ID application registration, and a small Node.js data proxy.

## Perspectives

<a href="/src/app/perspectives/README-perspectives.md">Perspectives</a> is a way to collect similar resources for another view of the Azure resources.

## Prerequisites

- Node.js 20 or newer and npm
- Azure CLI
- Terraform 1.5 or newer
- An Azure subscription and an Entra ID account allowed to create app registrations

## Resource Graph queries

Use **Available tables** next to **Azure Resource Graph query** to open the table
list. It shares the editor's built-in completion list, not a live Azure schema.
The overlay links to Microsoft's table and resource type reference for the latest
supported sources. Query scope and permissions determine the returned data, and
some tables may be empty. Close the overlay with **Escape**, its close button,
or by clicking outside it.

The Resource Graph tool displays query results as a table using the returned
column names. Up to eight columns are shown initially for wide results, with
common resource fields prioritized for resource-shaped results. Use **Columns**
to show or hide fields, or `project` in the query to choose the output explicitly.
Objects and arrays have compact cell summaries.

Click a row or focus it and press **Enter** to toggle the JSON returned by the query.
Projected-out fields are not fetched separately. Resource selection remains
available for rows containing `id`, `name`, and `type`.
The result count and an incomplete-results notice indicate when only part of a
result set was returned; additional pages are not loaded automatically.

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

### 2. Use the existing UI hosting

The UI can be deployed independently of the data proxy. For the existing
`saazome` Storage static website in `rg-azome`, **skip Terraform apply** and
continue below. The current Terraform configuration also provisions the proxy;
do not apply it for a UI-only release.

If resources do not exist yet, review the resources and costs before running:

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

### 3. Configure the UI at runtime

Create the two environment-specific configuration files once:

```bash
cp config/local/app-config.example.json config/local/app-config.json
cp config/azure/app-config.example.json config/azure/app-config.json
```

Fill in the Entra application `clientId`, `subscriptionId`, and `tenantId` in
each JSON file. These files are ignored by Git. Keep `production: false` for
local development and `production: true` for Azure. No secrets belong in these
files: the deployed JSON is publicly readable.

- `npm start` serves `config/local/app-config.json` as `/app-config.json`.
- `npm run build` copies `config/azure/app-config.json` to the production output
  as `/app-config.json`.
- Angular loads and validates this file before bootstrapping MSAL or services.
  Missing or invalid configuration stops startup with a visible error.
- `src/environments/environment.ts` is only a compatibility export. Do not edit
  it or switch TypeScript environments between local development and Azure.

Restart `npm start` after changing asset settings in `angular.json`. An already
running development server can hot-reload the application code without picking
up new asset settings, causing `/app-config.json` to return HTTP 404.

Locally, leave `azure.proxyUrl` empty: Angular's `proxy.conf.json` forwards
data-plane requests to the local Node.js proxy. In Azure, set it to the proxy's
HTTPS origin when the proxy is ready. An empty Azure proxy URL is allowed for
the initial UI-only release, but Storage, Cosmos DB and Log Analytics browsing
will not work until a proxy is configured. ARM and Graph requests go directly
to Azure and do not need the proxy.

Sign-in and sign-out return to the current website origin. Register
`http://localhost:4100/` and the production website URL, including its trailing
slash, as **SPA** redirect URIs in the Entra app registration.

### 4. Build and deploy only the UI

If using a separate Azure CLI profile, use it consistently for every Azure
command (including login and subscription selection):

```bash
export AZURE_CONFIG_DIR="$HOME/.azure-personal"
az account show --query '{name:name,id:id,tenantId:tenantId}'
```

Build the production bundle:

```bash
# On a clean checkout, install dependencies first:
npm ci
npm run build
```

The static website files are written to `dist/azome/browser`.

Publish to the existing Storage static website:

```bash
az storage blob upload-batch \
  --auth-mode login \
  --account-name saazome \
  --destination '$web' \
  --source dist/azome/browser \
  --overwrite \
  --content-cache-control 'no-cache'
```

The signed-in Azure identity needs the **Storage Blob Data Contributor** role on. This can be created with
```bash
az role assignment create \
  --assignee-object-id 5028a327-c03a-494d-82ea-a8dc67f8f83a \
  --assignee-principal-type User \
  --role "Storage Blob Data Contributor" \
  --scope "/subscriptions/219cc4c2-643f-4f88-a942-2977631c1616/resourceGroups/rg-azome/providers/Microsoft.Storage/storageAccounts/saazome"

az role assignment list \
  --assignee-object-id 5028a327-c03a-494d-82ea-a8dc67f8f83a \
  --all \
  --query "[?roleDefinitionName=='Storage Blob Data Contributor'].{Role:roleDefinitionName,Scope:scope}" \
  -o table
```

the website Storage account to upload the site. Check the current website URL:

```bash
az storage account show \
  --resource-group rg-azome \
  --name saazome \
  --query primaryEndpoints.web -o tsv
```

Verify that `/` and `/app-config.json` are available, then test sign-in and
resource listing in the browser.

### 5. Configure the proxy later without rebuilding the UI

After deploying the proxy separately, update `azure.proxyUrl` in
`config/azure/app-config.json` to its HTTPS origin, without a path. Upload only
the configuration file:

```bash
az storage blob upload \
  --auth-mode login \
  --account-name saazome \
  --container-name '$web' \
  --name app-config.json \
  --file config/azure/app-config.json \
  --content-type application/json \
  --content-cache-control 'no-store' \
  --overwrite
```

Reload the UI to load the updated settings. No Angular rebuild is needed.
Keep the local file's empty proxy URL unchanged. Set the proxy's
`ALLOWED_ORIGIN` to the UI origin, and check the proxy's `/health` endpoint.

For proxy behavior, supported routes, local development, and current network
limitations, see [README-proxy.md](README-proxy.md).
