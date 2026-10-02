# CodmosDB

Following needed to be run manually on cli. If this is really needed,
we need to either make azome-ui ask for consent and to do this on behalf of the
user (with his creadentials), or provide a notification to user and let him (admin)
do it manually

> _NOTE:_ Currently assigned to the user's personal ID

```
USER_OBJECT_ID=$(az ad signed-in-user show --query id -o tsv)
RESOURCE_GROUP="rg-data-lab"
ACCOUNT_NAME="cosmos-azome-lab-01"

az cosmosdb sql role assignment create \
  --account-name $ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --scope "/" \
  --principal-id $USER_OBJECT_ID \
  --role-definition-id "00000000-0000-0000-0000-000000000002"
```