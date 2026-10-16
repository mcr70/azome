# Azome data proxy

`scripts/storage-proxy.mjs` is a small Node.js HTTP proxy used by the Angular
application for Azure Storage and Cosmos DB data-plane requests. The same script
runs locally alongside `ng serve` and in the Azure Linux App Service provisioned
by Terraform.

## Routes and access

- `GET /storage-proxy/{account}/{service}/...` forwards read requests to Azure
  Blob, File, Queue, and Table endpoints. Storage SAS query parameters pass
  through to the Storage service.
- `GET|POST|PUT|DELETE /cosmos-proxy/{account}/...` forwards requests to the
  account's Cosmos DB endpoint, including the caller's Cosmos authorization
  header.
- `GET /health` returns a small health response.
- `OPTIONS` handles browser CORS preflight requests.

The proxy permits browser CORS requests only from `ALLOWED_ORIGIN`. This is a
browser policy, not proxy authentication. Storage authorization still depends
on the supplied short-lived, read-only SAS token, and Cosmos authorization still
depends on the signed-in user's Cosmos DB token and permissions. Keep the Azure
website and proxy URLs under your control, and grant users only the Azure access
they need.

## Azure deployment

Terraform provisions an HTTPS-only Linux Web App on the Free F1 service plan and
sets `ALLOWED_ORIGIN` to the Storage static website origin. The App Service is
public and is not connected to a virtual network. It can reach public Azure
service endpoints; this deployment does not provide access to resources that
are reachable only through private endpoints. VNet integration requires a
separately designed and appropriately priced App Service plan and subnet.

After applying Terraform, build the Angular application with `proxyUrl` set to
the `storage_proxy_url` Terraform output. Deploy the proxy and static website
using the commands in [README.md](README.md). The proxy package consists of
`scripts/storage-proxy.mjs`; App Service starts it with Node.js and supplies the
listening port. Check `https://<proxy-host>/health` after deployment.

To deploy a proxy-only update:

```bash
zip -j /tmp/azome-proxy.zip scripts/storage-proxy.mjs
az webapp deploy \
  --resource-group rg-azome \
  --name "$(terraform -chdir=terraform output -raw storage_proxy_app_name)" \
  --src-path /tmp/azome-proxy.zip \
  --type zip
```

## Local development

`npm start` runs the proxy on `127.0.0.1:4201` and Angular on
`http://localhost:4100`. Angular's `proxy.conf.json` routes the data-plane paths
to the local process. Local CORS allows the configured website origin only;
requests proxied through Angular's development server are same-origin.
