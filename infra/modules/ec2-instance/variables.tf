variable "instance_name" {
  description = "EC2 Name tag"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t4g.medium"
}

variable "key_name" {
  description = "AWS key pair name"
  type        = string
}

variable "allowed_ssh_cidr" {
  description = "CIDR allowed to access port 22"
  type        = string

  validation {
    condition     = can(cidrhost(var.allowed_ssh_cidr, 0))
    error_message = "allowed_ssh_cidr must be a valid CIDR (example: 203.0.113.10/32)."
  }
}

variable "root_volume_size" {
  description = "Root EBS size in GB"
  type        = number
  default     = 30
}

variable "associate_public_ip" {
  description = "Associate public IP to primary ENI"
  type        = bool
  default     = true
}

variable "create_eip" {
  description = "Allocate and associate an Elastic IP"
  type        = bool
  default     = true
}

variable "enable_https" {
  description = "Open 80/443 on security group"
  type        = bool
  default     = true
}

variable "environment" {
  description = "Environment label for tags"
  type        = string

  validation {
    condition     = contains(["devel", "stage", "prod"], var.environment)
    error_message = "environment must be one of devel/stage/prod."
  }
}

variable "user_data" {
  description = "Cloud-init user_data script"
  type        = string
  default     = null
}
