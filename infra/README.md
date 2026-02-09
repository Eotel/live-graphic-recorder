# live-graphic-recorder Infrastructure

OpenTofu/Terraform で `live-graphic-recorder` の EC2 基盤を管理します。

## 1. 前提条件

- OpenTofu または Terraform がインストール済み
- AWS CLI で `shiftone` プロファイルが利用可能
- Cloudflare の対象 Zone を操作できる API Token を用意済み
  - 環境変数 `CLOUDFLARE_API_TOKEN` に設定

## 2. ディレクトリ構成

```text
infra/
├── README.md
├── .gitignore
├── environments/
│   └── prod/
│       ├── main.tf
│       ├── outputs.tf
│       ├── providers.tf
│       ├── terraform.tfvars.sample
│       └── variables.tf
└── modules/
    ├── cloud-init-live-graphic/
    ├── cloudflare-dns/
    ├── ec2-instance/
    └── keypair/
```

## 3. Quick Start (`prod`)

```bash
cd infra/environments/prod
cp terraform.tfvars.sample terraform.tfvars
```

`terraform.tfvars` の最低限編集項目:

- `allowed_ssh_cidr`: 自分のIP (`x.x.x.x/32`)
- `cloudflare_zone_id`

現在のIP確認:

```bash
curl -s ifconfig.me
```

Cloudflare token を設定:

```bash
export CLOUDFLARE_API_TOKEN="..."
```

デプロイ:

```bash
# OpenTofu
tofu init
tofu plan
tofu apply

# Terraform
# terraform init
# terraform plan
# terraform apply
```

## 4. この IaC が作るもの

- EC2 (Ubuntu 24.04 ARM64, default `t4g.medium`)
- Security Group
  - `22/tcp`: `allowed_ssh_cidr` のみ許可
  - `80/tcp`, `443/tcp`: 公開
- Elastic IP (`create_eip=true` の場合)
- Cloudflare A レコード
  - `live-graphic-recorder.ccbt.shiftone.app`
  - Proxy 有効
- SSH キーペア（ローカルに `.pem` 保存）
- cloud-init 初期化
  - Bun インストール
  - Caddy インストールと `reverse_proxy 127.0.0.1:3000`
  - `live-graphic-recorder.service` を systemd に配置

## 5. EC2 作成後の手動作業

### 5.1 SSH 接続

```bash
cd infra/environments/prod
tofu output -raw ssh_command
```

### 5.2 アプリ配置

```bash
sudo mkdir -p /opt/live-graphic-recorder
sudo chown -R ubuntu:ubuntu /opt/live-graphic-recorder
cd /opt/live-graphic-recorder
git clone <repo-url> .
```

### 5.3 本番用 `.env` 配置

`/opt/live-graphic-recorder/.env`:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
OPENAI_API_KEY=...
DEEPGRAM_API_KEY=...
GOOGLE_API_KEY=...
AUTH_JWT_SECRET=...
WS_ALLOWED_ORIGINS=https://live-graphic-recorder.ccbt.shiftone.app
```

### 5.4 サービス起動

```bash
cd /opt/live-graphic-recorder
bun install --frozen-lockfile
sudo systemctl start live-graphic-recorder
sudo systemctl restart caddy
```

### 5.5 動作確認

```bash
curl -I https://live-graphic-recorder.ccbt.shiftone.app/api/health
sudo systemctl status live-graphic-recorder
sudo systemctl status caddy
```

## 6. 出力値

```bash
cd infra/environments/prod
tofu output
```

主な出力:

- `public_ip`
- `ssh_command`
- `domain_name`
- `https_url`
- `private_key_path`

## 7. 削除

```bash
cd infra/environments/prod
tofu destroy
```

## 8. 補足

- Cloudflare Proxy を使うため、Origin 側は Caddy で HTTPS 終端する前提です。
- `AUTH_JWT_SECRET` は production で必須です（未設定だとアプリ起動失敗）。
