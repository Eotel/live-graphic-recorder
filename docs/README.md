# Live Graphic Recorder ドキュメント

## 1. このアプリでできること

Live Graphic Recorder は、会議の音声と映像コンテキストを使って、リアルタイムに議論を可視化するアプリです。

- リアルタイム文字起こし
  - Deepgram（`nova-3`, `ja`）で音声を逐次テキスト化
  - 話者番号（speaker）と発話区切り（utterance end）を扱う
- 会議内容の自動分析
  - OpenAI（`gpt-5.2`）で要点・トピック・タグ・Flow/Heat を生成
  - 解析トリガ: `5分`ごと、または `500 words` 到達時
- グラフィックレコーディング画像生成
  - Gemini（デフォルト: `gemini-2.5-flash-image`）で画像生成
  - UI から Flash/Pro のモデルプリセット切り替え
- カメラ/画面共有の映像コンテキスト活用
  - 60秒ごとにキャプチャし、解析コンテキストへ反映
- 会議履歴の再開
  - 過去会議の一覧表示、選択して再開
  - 既存会議の transcript/analysis/image/history を復元
- レポート出力
  - `/api/meetings/:meetingId/report.zip` で ZIP 出力
  - サマリー・集計 JSON・メディア同梱（条件付き）
- ローカル音声保持とアップロード
  - ブラウザ側で録音チャンクを保持し、会議単位でサーバーへアップロード

## 2. 技術スタック（概要）

- Runtime/Server: Bun
- Frontend: React 19 + TypeScript + Tailwind CSS
- Realtime: WebSocket（`/ws/recording`）
- STT: Deepgram
- LLM分析: OpenAI Responses API
- 画像生成: Google Gemini
- 永続化: SQLite（`bun:sqlite`）

## 3. 動作要件

- Bun `1.2.x` 推奨（`packageManager: bun@1.2.0`）
- API キー
  - `OPENAI_API_KEY`
  - `DEEPGRAM_API_KEY`
  - `GOOGLE_API_KEY`
- ブラウザ
  - マイク/カメラ/画面共有 API が利用可能なモダンブラウザ
  - ローカル音声保存（OPFS）と Popout（Document PiP）を使う場合は Chromium 系推奨

## 4. 環境変数

プロジェクトルートの `.env` に設定します。

必須:

- `OPENAI_API_KEY`: 解析生成で利用
- `DEEPGRAM_API_KEY`: リアルタイム文字起こしで利用
- `GOOGLE_API_KEY`: 画像生成で利用

任意:

- `GEMINI_IMAGE_MODEL_FLASH`: Flash 側モデル（未指定時 `gemini-2.5-flash-image`）
- `GEMINI_IMAGE_MODEL_PRO`: Pro 側モデル。設定すると UI の Pro 切替が有効化
- `PORT`: サーバーポート（既定: `3000`）
- `HOST`: バインド先（既定: `127.0.0.1`）

## 5. セットアップ

依存関係のインストール:

```bash
bun install
```

開発起動（HMR）:

```bash
bun dev
```

本番相当で起動:

```bash
bun start
```

ヘルスチェック:

```bash
curl -sS http://127.0.0.1:3000/api/health
```

Tailscale Funnel で公開する場合:

```bash
bun run tunnel
```

## 6. 基本的な使い方

1. アプリ起動後、`Start New Meeting` で会議開始（または過去会議を選択）
2. `Grant Camera & Mic Access` で権限付与
3. `Start` で録音開始
4. 会話に応じて、文字起こし・要約・トピック/タグ・Flow/Heat・画像が更新
5. 必要に応じて `Cloud Save` でローカル音声をサーバーへ保存
6. `レポートDL` で会議レポート ZIP を取得

## 7. 主要 API / エンドポイント

- `GET /api/health`
- `WS /ws/recording`
- `POST /api/meetings/:meetingId/audio`
- `GET /api/meetings/:meetingId/audio/:audioId`
- `GET /api/meetings/:meetingId/images/:imageId`
- `GET /api/meetings/:meetingId/captures/:captureId`
- `GET /api/meetings/:meetingId/report.zip?media=auto`

## 8. 保存先

サーバー側のデータは既定で以下に保存されます。

- DB: `data/live-graphic-recorder.db`
- メディア: `data/media`
  - 画像: `data/media/images/<sessionId>/...`
  - キャプチャ: `data/media/captures/<sessionId>/...`
  - 音声: `data/media/audio/<sessionId>/...`

## 9. 補足・注意点

- `GEMINI_IMAGE_MODEL_PRO` 未設定時、Pro への切替はできません（Flash のみ）。
- 画面共有はブラウザ・OS の制約を受けます。
- Popout は Document PiP 対応ブラウザでは常時最前面、非対応ブラウザでは `window.open` フォールバックです。

## 10. 関連ドキュメント

- コスト見積もり: `docs/cost-estimate.md`
- 既知不具合メモ: `docs/bugs/grant-camera-mic-button-noop.md`
