resource "azurerm_virtual_network" "vnet2" {
  name                = "vnet-azome-lab-2"
  address_space       = ["10.43.0.0/16"]
  location            = azurerm_resource_group.networking_lab.location
  resource_group_name = azurerm_resource_group.networking_lab.name

  tags = azurerm_resource_group.networking_lab.tags
}


resource "azurerm_subnet" "secondary_application" {
  name                 = "snet-2-application"
  resource_group_name  = azurerm_resource_group.networking_lab.name
  virtual_network_name = azurerm_virtual_network.vnet2.name
  address_prefixes     = ["10.43.1.0/24"]
}
