locals {
  user_data = templatefile("${path.module}/templates/user_data.sh.tftpl", {
    fqdn     = var.fqdn
    app_dir  = var.app_dir
    app_user = var.app_user
    app_port = var.app_port
  })
}
