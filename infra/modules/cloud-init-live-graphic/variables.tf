variable "fqdn" {
  description = "Public FQDN for Caddy site block"
  type        = string
}

variable "app_dir" {
  description = "Application directory path"
  type        = string
  default     = "/opt/live-graphic-recorder"
}

variable "app_user" {
  description = "Linux user that runs the Bun service"
  type        = string
  default     = "ubuntu"
}

variable "app_port" {
  description = "Local Bun server port"
  type        = number
  default     = 3000
}
