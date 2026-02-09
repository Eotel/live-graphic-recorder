variable "key_name" {
  description = "AWS key pair name"
  type        = string
}

variable "private_key_path" {
  description = "Local file path to save generated private key"
  type        = string
}

variable "environment" {
  description = "Environment label for tags"
  type        = string
}
