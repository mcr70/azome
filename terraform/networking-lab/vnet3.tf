resource "azurerm_virtual_network" "vnet3" {
  name                = "vnet-azome-lab-3"
  address_space       = ["10.44.0.0/16"]
  location            = azurerm_resource_group.networking_lab.location
  resource_group_name = azurerm_resource_group.networking_lab.name

  tags = azurerm_resource_group.networking_lab.tags
}


resource "azurerm_subnet" "subnet_3_1" {
  name                 = "snet-secondary-application"
  resource_group_name  = azurerm_resource_group.networking_lab.name
  virtual_network_name = azurerm_virtual_network.vnet3.name
  address_prefixes     = ["10.44.1.0/24"]
}
