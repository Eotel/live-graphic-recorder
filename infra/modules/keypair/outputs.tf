output "key_name" {
  description = "Created AWS key pair name"
  value       = aws_key_pair.this.key_name
}

output "private_key_path" {
  description = "Saved private key path"
  value       = local_file.private_key.filename
}
