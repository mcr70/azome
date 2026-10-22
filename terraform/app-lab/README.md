# Application logging lab

This lab provisions the existing Node.js Function App and a separate Linux F1
App Service. The App Service responds to `GET /` with JSON and writes one JSON
log line to stdout for every request. Use it to investigate App Service log
streaming independently from the Function App.

## Provision the resources

```bash
terraform init
terraform apply
```

The App Service name must be globally unique. Override `web_app_name` with a
unique value if Terraform reports that the default name is unavailable:

```bash
terraform apply -var="web_app_name=azome-test-web-<unique-suffix>"
```

The F1 plan is free and intended for experiments. It has limited shared
resources and no SLA. The Function App and App Service use separate service
plans.

## Deploy the test app

```bash
cd web_app
zip -r /tmp/azome-app-service-log-test.zip .
az webapp deploy \
  --resource-group rg-app-lab \
  --name "$(terraform -chdir=.. output -raw web_app_name)" \
  --src-path /tmp/azome-app-service-log-test.zip \
  --type zip
```

If Terraform was run from a different directory, replace `terraform -chdir=..`
with the path to `terraform/app-lab`.

Call the app directly to generate a log entry:

```bash
curl "$(terraform -chdir=.. output -raw web_app_url)"
```

In the Azure portal, open the Web App and select **Monitoring > Log stream** to
view application logs. The Web App's application logging is configured at the
Information level.

Return to the `terraform/app-lab` directory before deploying the Function App.

## Log Analytics export

The lab's Log Analytics workspace currently receives the Function App's
`FunctionAppLogs`. The Web App can send its stdout/stderr records to the same
workspace through the `AppServiceConsoleLogs` diagnostic category. Exporting
logs to Log Analytics can incur ingestion charges. The diagnostic setting is
enabled for the Web App by this lab.

## Function App

Terraform creates the Function App, but you deploy it manually:

```bash
cd function_app
npm install
func azure functionapp publish azome-test-func-app-2026 --javascript
```

To stop or start the Function App:

```bash
az functionapp stop --name azome-test-func-app-2026 --resource-group rg-app-lab
az functionapp start --name azome-test-func-app-2026 --resource-group rg-app-lab
```
