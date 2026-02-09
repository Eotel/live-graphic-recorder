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
- `AUTH_JWT_SECRET`（十分に長いランダム文字列）

画像モデル切替（UI の「画像モデル」トグルに反映）:

- `GEMINI_IMAGE_MODEL_FLASH`（未指定なら `gemini-2.5-flash-image`）
- `GEMINI_IMAGE_MODEL_PRO`（Pro を有効化する場合に指定。例: `gemini-3-pro-image-preview`）

WebSocket Origin 制御（CSWSH 対策）:

- `WS_ALLOWED_ORIGINS`（任意。カンマ区切りの絶対 origin）
  - 例: `https://app.example.com,https://admin.example.com`
  - 未設定でも同一 origin（`Origin` とリクエスト先 origin が一致）は許可されます

## 管理ユーザー権限

初期ユーザーの自動昇格はありません。管理権限は管理コマンドで付与します。

```bash
# admin 付与（Django createsuperuser 相当）
bun run createsuperuser -- --email admin@example.com

# staff 付与
bun run user:role -- --email staff@example.com --role staff
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
