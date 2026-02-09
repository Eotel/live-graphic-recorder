locals {
  key_name         = "live-graphic-recorder-${var.environment}"
  private_key_path = "${pathexpand(var.private_key_dir)}/${local.key_name}.pem"
  fqdn             = "${var.cloudflare_record_name}.${var.root_domain}"
}

module "keypair" {
  source = "../../modules/keypair"

  key_name         = local.key_name
  private_key_path = local.private_key_path
  environment      = var.environment
}

module "cloud_init" {
  source = "../../modules/cloud-init-live-graphic"

  fqdn     = local.fqdn
  app_dir  = var.app_dir
  app_user = var.app_user
  app_port = var.app_port
}

module "ec2" {
  source = "../../modules/ec2-instance"

  instance_name       = var.instance_name
  instance_type       = var.instance_type
  key_name            = module.keypair.key_name
  allowed_ssh_cidr    = var.allowed_ssh_cidr
  root_volume_size    = var.root_volume_size
  associate_public_ip = true
  create_eip          = var.create_eip
  enable_https        = var.enable_https
  environment         = var.environment
  user_data           = module.cloud_init.user_data
}

module "dns" {
  source = "../../modules/cloudflare-dns"

  zone_id     = var.cloudflare_zone_id
  record_name = var.cloudflare_record_name
  domain_name = var.root_domain
  target_ip   = module.ec2.public_ip
  proxied     = true
  environment = var.environment
}
