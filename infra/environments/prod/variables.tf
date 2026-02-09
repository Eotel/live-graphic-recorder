variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-1"
}

variable "aws_profile" {
  description = "AWS CLI profile name"
  type        = string
  default     = "shiftone"
}

variable "environment" {
  description = "Environment label"
  type        = string
  default     = "prod"

  validation {
    condition     = contains(["devel", "stage", "prod"], var.environment)
    error_message = "environment must be one of devel/stage/prod."
  }
}

variable "instance_name" {
  description = "EC2 Name tag"
  type        = string
  default     = "live-graphic-recorder-prod"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t4g.medium"
}

variable "root_volume_size" {
  description = "Root EBS size in GB"
  type        = number
  default     = 30
}

variable "allowed_ssh_cidr" {
  description = "CIDR allowed for SSH"
  type        = string
}

variable "root_domain" {
  description = "Root domain"
  type        = string
  default     = "shiftone.app"
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID"
  type        = string
}

variable "cloudflare_record_name" {
  description = "Record name part under root domain"
  type        = string
  default     = "live-graphic-recorder.ccbt"
}

variable "private_key_dir" {
  description = "Directory path where private key is saved"
  type        = string
  default     = "~/.ssh/keys/eotel"
}

variable "app_dir" {
  description = "Application directory on EC2"
  type        = string
  default     = "/opt/live-graphic-recorder"
}

variable "app_user" {
  description = "Linux user running Bun app"
  type        = string
  default     = "ubuntu"
}

variable "app_port" {
  description = "Local Bun listen port"
  type        = number
  default     = 3000
}

variable "create_eip" {
  description = "Allocate Elastic IP"
  type        = bool
  default     = true
}

variable "enable_https" {
  description = "Open 80 and 443 in security group"
  type        = bool
  default     = true
}
