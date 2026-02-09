variable "zone_id" {
  description = "Cloudflare zone ID"
  type        = string
}

variable "record_name" {
  description = "Record name under root domain (example: app.ccbt)"
  type        = string
}

variable "domain_name" {
  description = "Root domain name (example: shiftone.app)"
  type        = string
}

variable "target_ip" {
  description = "IPv4 target for A record"
  type        = string
}

variable "proxied" {
  description = "Enable Cloudflare proxy"
  type        = bool
  default     = true
}

variable "ttl" {
  description = "TTL (only used when proxied=false)"
  type        = number
  default     = 300
}

variable "environment" {
  description = "Environment label for record comment"
  type        = string
}
