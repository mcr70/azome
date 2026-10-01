# ==== Storage Account (Container & Blob) ====

resource "azurerm_storage_container" "test_container" {
  name                  = "dev-sample-data"
  storage_account_id    = azurerm_storage_account.data_test.id
  container_access_type = "private"
}

resource "azurerm_storage_blob" "sample_file" {
  name                   = "app-config.json"
  storage_container_id   = azurerm_storage_container.test_container.id
  type                   = "Block"
  content_type           = "application/json"

  source_content = jsonencode({
    appName     = "Azome UI"
    environment = "lab"
    featureFlags = {
      enableExperimentalUi = true
      maxItemsPerPage      = 50
    }
  })
}

# ==== File share ====
resource "azurerm_storage_share" "test_share" {
  name               = "azome-dev-share"
  storage_account_id = azurerm_storage_account.data_test.id
  quota              = 1
}

resource "azurerm_storage_share_file" "example" {
  name              = "README.md"
  storage_share_url = azurerm_storage_share.test_share.url
  source            = "README.md"
}


# ==== Queue ====
resource "azurerm_storage_queue" "test_queue" {
  name               = "azome-dev-queue"
  storage_account_id = azurerm_storage_account.data_test.id
}

# ==== Table ====
resource "azurerm_storage_table" "test_table" {
  name               = "azomedevtable"
  storage_account_id = azurerm_storage_account.data_test.id
}
# ==============================================================================
# Cosmos DB (Database, Container & Item)
# ==============================================================================

resource "azurerm_cosmosdb_sql_database" "test_db" {
  name                = "azome-dev-db"
  resource_group_name = azurerm_resource_group.data_lab.name
  account_name        = azurerm_cosmosdb_account.data_test.name
}

resource "azurerm_cosmosdb_sql_container" "test_container" {
  name                = "ui-settings"
  resource_group_name = azurerm_resource_group.data_lab.name
  account_name        = azurerm_cosmosdb_account.data_test.name
  database_name       = azurerm_cosmosdb_sql_database.test_db.name
  partition_key_paths = ["/category"]
}

