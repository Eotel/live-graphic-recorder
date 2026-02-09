output "instance_id" {
  description = "EC2 instance ID"
  value       = module.ec2.instance_id
}

output "public_ip" {
  description = "Public IP address"
  value       = module.ec2.public_ip
}

output "private_ip" {
  description = "Private IP address"
  value       = module.ec2.private_ip
}

output "security_group_id" {
  description = "Security group ID"
  value       = module.ec2.security_group_id
}

output "key_name" {
  description = "AWS key pair name"
  value       = module.keypair.key_name
}

output "private_key_path" {
  description = "Generated private key path"
  value       = module.keypair.private_key_path
}

output "ssh_command" {
  description = "SSH command"
  value       = "ssh -i ${module.keypair.private_key_path} ubuntu@${module.ec2.public_ip}"
}

output "domain_name" {
  description = "Public domain name"
  value       = module.dns.fqdn
}

output "https_url" {
  description = "Service URL"
  value       = "https://${module.dns.fqdn}"
}

output "cloudflare_record_id" {
  description = "Cloudflare A record ID"
  value       = module.dns.record_id
}

output "cloudflare_proxied" {
  description = "Whether Cloudflare proxy is enabled"
  value       = module.dns.proxied
}

output "systemd_service_name" {
  description = "Provisioned systemd service"
  value       = module.cloud_init.systemd_service_name
}

output "app_dir" {
  description = "Application directory on EC2"
  value       = var.app_dir
}

output "ami_id" {
  description = "AMI ID used for EC2 launch"
  value       = module.ec2.ami_id
}
