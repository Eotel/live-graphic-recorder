output "user_data" {
  description = "Rendered cloud-init user_data"
  value       = local.user_data
}

output "systemd_service_name" {
  description = "Provisioned systemd service name"
  value       = "live-graphic-recorder.service"
}
