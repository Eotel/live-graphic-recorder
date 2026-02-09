output "record_id" {
  description = "Cloudflare record ID"
  value       = cloudflare_record.a.id
}

output "hostname" {
  description = "Cloudflare hostname output"
  value       = cloudflare_record.a.hostname
}

output "fqdn" {
  description = "Fully qualified domain name"
  value       = "${var.record_name}.${var.domain_name}"
}

output "proxied" {
  description = "Whether proxy mode is enabled"
  value       = cloudflare_record.a.proxied
}
