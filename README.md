# Live Graphic Recorder

## セットアップ

依存関係をインストール:

```bash
bun install
```

## 開発 (HMR)

```bash
bun dev
```

## 本番 (production)

HMR なしで起動（公開用途はこちら推奨）:

```bash
bun start
```

## Tailscale Funnel で公開

別ターミナルで:

```bash
tailscale funnel 3000
```

確認:

```bash
curl -sS https://<your-host>/api/health
```
