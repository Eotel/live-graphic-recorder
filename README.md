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

## 環境変数

必須:

- `OPENAI_API_KEY`
- `DEEPGRAM_API_KEY`
- `GOOGLE_API_KEY`

画像モデル切替（UI の「画像モデル」トグルに反映）:

- `GEMINI_IMAGE_MODEL_FLASH`（未指定なら `gemini-2.5-flash-image`）
- `GEMINI_IMAGE_MODEL_PRO`（Pro を有効化する場合に指定。例: `gemini-3-pro-image-preview`）

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
