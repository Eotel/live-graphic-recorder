terraform {
  required_version = ">= 1.0.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

resource "cloudflare_record" "a" {
  zone_id = var.zone_id
  name    = var.record_name
  content = var.target_ip
  type    = "A"
  ttl     = var.proxied ? 1 : var.ttl
  proxied = var.proxied

  comment = "Managed by Terraform - ${var.environment}"
}
