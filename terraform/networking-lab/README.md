# Networking Lab

This standalone Terraform configuration creates free Azure networking control-plane resources for developing the Azome Networking Perspective:

- Resource group
- Virtual network with application and data subnets
- Network security groups associated with both subnets
- Empty route table associated with the data subnet

It intentionally does not create billable workload or edge resources such as virtual machines, public IP addresses, NAT Gateway, Azure Firewall, Application Gateway, VPN Gateway, or private endpoints.

This module stores its state in the same Azure Storage Account and container as `terraform/`, but uses its own blob key: `networking-lab.tfstate`. It does not share state with `terraform/azome.tfstate`.

## Deploy

1. Authenticate with Azure CLI. Terraform uses the active Azure CLI subscription:

   ```bash
   az login
   ```

2. Initialize, validate, review, and deploy:

   ```bash
   terraform init
   terraform validate
   terraform plan
   terraform apply
   ```

## Remove the lab

Destroy the resources when the prototype is no longer needed:

```bash
terraform destroy
```
