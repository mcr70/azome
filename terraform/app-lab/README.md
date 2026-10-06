# Function app

Terraform creates the function app, but you need to deploy it manually. '
This is not strictly needed, if you wish to just explore azome-ui.

```
# Install this to be able to install the app from the cli
brew trust azure/functions
brew tap azure/functions
brew install azure-functions-core-tools@4

# To deploy
cd function_app/
npm install
func azure functionapp publish azome-test-func-app-2026

# To stop and start
az functionapp stop --name azome-test-func-app-2026 --resource-group rg-app-lab
az functionapp start --name azome-test-func-app-2026 --resource-group rg-app-lab
```

Stopping the function guarantees, that it won't cause any credits to be consumed.