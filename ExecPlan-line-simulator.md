# LINE模擬フロントとデモデータ導入による出欠申請体験強化

このExecPlanはリビングドキュメントであり、.agent/PLANS.mdの要件に従う。`Progress`、`Surprises & Discoveries`、`Decision Log`、`Outcomes & Retrospective`は常に最新に保つこと。

## Purpose / Big Picture

LINE公式アカウントを使わなくてもブラウザ内で出欠申請の流れを体験できるようにする。保護者側のUIで「出席/欠席」ボタンや日付選択を備えたチャット風モックを用意し、送信内容を既存のWebhookロジックに渡してSupabaseへ反映できる。スタッフ画面はダミーデータを含めて即座に一覧の見た目を確認できるようにし、完成後にLINEモックとスタッフ画面のスクリーンショットを取得する。

## Progress

- [x] (2026-01-06 13:52Z) 初稿作成（目的と作業方針をまとめ、現状とゴールを整理）
- [x] (2026-01-06 14:00Z) LINE模擬UIとモックAPIを追加し、デモモードでレスポンスを返せるようにした
- [x] (2026-01-06 14:02Z) スタッフ一覧にダミーデータ切替とナビゲーションを追加、スタイルを拡充
- [x] (2026-01-06 14:03Z) 手動操作で送信とデモ表示を確認し、スクリーンショットを取得
- [ ] 振り返りとドキュメント/PR作成

## Surprises & Discoveries

- SupabaseがダミーURLの場合、`/api/admin/attendance`は500を返すが、UIが自動でデモモードに切り替わることを確認した。

## Decision Log

- Decision: モックAPI `/api/mock/line-simulator` ではSupabase接続が無い場合にデモ用のresolverへフォールバックし、署名検証を常にスキップする方針にした。
  Rationale: 環境変数が揃っていなくてもブラウザ上でLINE送信の流れを体験できるようにするため。
  Date/Author: 2026-01-06 / assistant
- Decision: スタッフ一覧はAPIエラー時に自動でデモモードへ切り替え、手動でもトグルできるUIを追加した。
  Rationale: Supabase未接続でも表の構成やフィルタ挙動を確認できるようにするため。
  Date/Author: 2026-01-06 / assistant

## Outcomes & Retrospective

- 完了後に記載する。

## Context and Orientation

- フロントエンドはNext.jsのApp Router構成。メインのスタイルは`src/app/globals.css`で定義され、`card`や`stack`などのユーティリティクラスがある。
- 既存のスタッフ一覧は`src/app/admin/attendance/AttendanceTable.tsx`がクライアントコンポーネントで、`/api/admin/attendance`からデータを取得する。Supabaseが無い環境では空表示となる。
- LINE Webhookの本体は`src/app/api/line/webhook/route.ts`と`src/lib/lineWebhook.ts`で、`handleLineWebhook`に依存性を注入している。署名検証は`SKIP_LINE_SIGNATURE=true`でバイパス可能。
- 出欠ステータスの表示ラベルやpillクラスは`src/lib/line.ts`の`statusLabel`と`statusClassName`で提供される。

## Plan of Work

1. LINE模擬用のUIページを新設し、チャット風のメッセージリストと入力フォーム（生徒名、ステータスボタン、日付選択、任意メモ）を実装する。送信時にWebhook用のJSONを組み立て、専用のモックAPIにPOSTし、レスポンスをチャットに反映させる。サンプル保護者・生徒データを初期化してすぐ体験できるようにする。
2. モックAPIを`/api/mock/line-simulator`として追加し、`handleLineWebhook`を署名検証なしで呼び出す。Supabase未接続環境では擬似レスポンスとローカルログを返すフェイルセーフを設ける。
3. スタッフ一覧に「デモデータを挿入」操作または初期ダミーレコードを追加し、Supabaseが無い場合でも見た目を再現する。トップページにLINEモックへの導線を追加する。
4. 手動で送信し、チャット側のレスポンス表示とスタッフ一覧のダミーデータ表示を確認し、スクリーンショットを取得する。必要に応じてスタイル微調整を行う。

## Concrete Steps

- 作業ディレクトリ `/workspace/free-school-try3` で進める。
- 新規ページ `src/app/line-simulator/page.tsx`（必要なら分割コンポーネントを同ディレクトリに作成）を追加し、状態管理は`useState`と`useMemo`で完結させる。サンプル生徒リストを定義し、送信履歴をローカルで保持する。
- モックAPI `src/app/api/mock/line-simulator/route.ts` を追加し、`handleLineWebhook`へ依存を注入する。`supabaseServerClient`が環境不足でエラーになった際の例外処理として、スタブレスポンスで200を返すようにする。
- スタッフ一覧`AttendanceTable`にダミーデータ挿入ロジック（「ダミーデータを読み込む」ボタンやフェイルセーフ）と空表示時のチップを追加する。ホーム`src/app/page.tsx`にLINEモックへのリンクを追記する。
- `npm test`が通るか確認する（環境制約で失敗する場合はメモ）。必要に応じて`npm run lint`や`npm run dev`は省略する。

## Validation and Acceptance

- LINE模擬ページでサンプル保護者/生徒を選び、ステータスボタンと日付を指定して送信すると、チャットログに「〇〇を登録しました」系のレスポンスが表示される。Supabaseが設定されていればWebhook経由でDBに登録される。
- スタッフ一覧ページにダミーデータを表示する操作があり、Supabase未設定でも表形式で出欠の見た目が確認できる。
- 作業完了後、LINE模擬ページとスタッフ一覧トップのスクリーンショットを取得し、最終メッセージに添付する。

## Idempotence and Recovery

- モックAPIは`skipSignature`で常に署名検証をスキップするため、繰り返し送信しても問題ない。Supabase未接続時のスタブレスポンスは副作用なし。
- ダミーデータの読み込みはローカル状態にのみ影響し、ページをリロードすれば初期状態に戻る。

## Artifacts and Notes

- スクリーンショット: `artifacts/line-simulator.png`、`artifacts/admin-attendance.png`
- 手動検証: line-simulatorで欠席+メモを送信し、チャットログにレスポンスが追加されることを確認。admin/attendanceはデモ表示へ切り替わり、日付フィルタが効くことを確認。

## Interfaces and Dependencies

- 新規API: `POST /api/mock/line-simulator`（Body: `{ guardianName, lineUserId, studentName, status, date, note }`）。`handleLineWebhook`を署名スキップで呼び出し、レスポンスをそのまま返却する。Supabase未接続時は`ok: true`のダミー結果を返す。
- 新規ページ: `/line-simulator`。チャットUI、ステータスボタン（出席/欠席/遅刻/早退/未定）、日付入力、サンプル生徒のクイックボタン、Webhook送信ボタンを提供する。
- 既存ページ: `/admin/attendance` にダミーデータロードのUIを追加し、`statusLabel`/`statusClassName`で見た目を統一する。
