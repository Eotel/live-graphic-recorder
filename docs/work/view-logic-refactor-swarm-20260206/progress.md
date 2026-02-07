# 進捗ボード

- 目標: View/Logic 分離のフェーズ1-3基盤を安全導入し、App.tsx を 200 行以下に縮小する
- 初期値: N/A

## Task Board

| Task | Agent | Status | Start            | End              | Notes                                         |
| ---- | ----- | ------ | ---------------- | ---------------- | --------------------------------------------- |
| T01  | A01   | DONE   | 2026-02-06 23:41 | 2026-02-06 23:54 | app-store / app-store.test.ts を追加          |
| T02  | A02   | DONE   | 2026-02-06 23:42 | 2026-02-06 23:54 | usecases と usecases.test.ts を追加           |
| T03  | A03   | DONE   | 2026-02-06 23:43 | 2026-02-06 23:54 | AppShell 導入・App.tsx 薄化                   |
| T04  | A04   | DONE   | 2026-02-06 23:44 | 2026-02-06 23:54 | MeetingHeader の confirm を container へ移管  |
| T05  | A05   | DONE   | 2026-02-06 23:45 | 2026-02-06 23:54 | useAttachMediaStream 分離と test 追加         |
| T06  | A06   | DONE   | 2026-02-06 23:46 | 2026-02-06 23:54 | useMeetingSession に deprecation コメント追加 |
| T07  | A07   | DONE   | 2026-02-06 23:58 | 2026-02-07 00:20 | AppShell を container/view へ再分割           |
| T08  | A08   | DONE   | 2026-02-07 00:00 | 2026-02-07 00:20 | app-store を AppShell 状態ソースへ段階移行    |

## Agent Updates

### A01

- `src/app/view-model/app-store.ts` を追加。
- 状態スキーマ（auth/meeting/recording/media/upload/ui/derived）と action interface を実装。
- `src/app/view-model/app-store.test.ts` で主要遷移を確認。

### A02

- `src/app/usecases/*.ts` を追加。
- meeting 作成/選択、録音ライフサイクル、logout、report download の usecase を分離。
- `src/app/usecases/usecases.test.ts` を追加。

### A03

- `src/app/container/AppShell.tsx` を追加し、旧 `App.tsx` の実装を移管。
- `src/App.tsx` はルート配線のみに縮小。

### A04

- `src/components/navigation/MeetingHeader.tsx` から confirm を削除。
- `onBackRequested` イベントのみ発火する形に変更。
- confirm 判定は `src/app/container/AppShell.tsx` 側へ移管。

### A05

- `src/hooks/useAttachMediaStream.ts` を追加。
- `src/hooks/useMediaStreamController.ts` の video attach 責務を分離。
- `src/hooks/useAttachMediaStream.test.ts` を追加。

### A06

- `src/hooks/useMeetingSession.ts` に deprecation コメントを追加。

### A07

- `src/app/container/AppShell.tsx` を薄いエントリへ変更。
- `src/app/view/AppShellView.tsx` / `src/app/view/AppShellRecordingView.tsx` / `src/app/view/AppShellSelectView.tsx` を追加し UI を view 層へ分離。
- `src/app/container/useAppShellController.ts` を 270 行へ整理し責務分割を実施。

### A08

- `src/app/view-model/app-store.ts` に section 更新 action (`setAuthState` ほか) と `onDownloadReportError` 依存を追加。
- `src/app/container/useAppShellStore.ts` / `src/app/container/useAppShellStoreBridge.ts` を追加し AppShell と app-store の同期を段階導入。
- `src/app/view-model/app-store.test.ts` に section action / report error callback のテストを追加。
