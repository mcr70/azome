
resource "azurerm_virtual_network" "vnet1" {
  name                = "vnet-azome-lab-1"
  address_space       = ["10.42.0.0/16"]
  location            = azurerm_resource_group.networking_lab.location
  resource_group_name = azurerm_resource_group.networking_lab.name

  tags = azurerm_resource_group.networking_lab.tags
}

resource "azurerm_subnet" "application" {
  name                 = "snet-application"
  resource_group_name  = azurerm_resource_group.networking_lab.name
  virtual_network_name = azurerm_virtual_network.vnet1.name
  address_prefixes     = ["10.42.1.0/24"]
}

resource "azurerm_subnet" "data" {
  name                 = "snet-data"
  resource_group_name  = azurerm_resource_group.networking_lab.name
  virtual_network_name = azurerm_virtual_network.vnet1.name
  address_prefixes     = ["10.42.2.0/24"]
}

resource "azurerm_network_security_group" "application" {
  name                = "nsg-application"
  location            = azurerm_resource_group.networking_lab.location
  resource_group_name = azurerm_resource_group.networking_lab.name

  tags = azurerm_resource_group.networking_lab.tags
}

resource "azurerm_network_security_group" "data" {
  name                = "nsg-data"
  location            = azurerm_resource_group.networking_lab.location
  resource_group_name = azurerm_resource_group.networking_lab.name

  tags = azurerm_resource_group.networking_lab.tags
}

resource "azurerm_route_table" "data" {
  name                = "rt-data"
  location            = azurerm_resource_group.networking_lab.location
  resource_group_name = azurerm_resource_group.networking_lab.name

  tags = azurerm_resource_group.networking_lab.tags
}

resource "azurerm_subnet_route_table_association" "data" {
  subnet_id      = azurerm_subnet.data.id
  route_table_id = azurerm_route_table.data.id
}

resource "azurerm_subnet_network_security_group_association" "application" {
  subnet_id                 = azurerm_subnet.application.id
  network_security_group_id = azurerm_network_security_group.application.id
}

resource "azurerm_subnet_network_security_group_association" "data" {
  subnet_id                 = azurerm_subnet.data.id
  network_security_group_id = azurerm_network_security_group.data.id
}
