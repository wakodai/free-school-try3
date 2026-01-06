# 無料塾向けLINE出欠管理MVP構築

このExecPlanはリビングドキュメントであり、.agent/PLANS.mdの要件に従う。`Progress`、`Surprises & Discoveries`、`Decision Log`、`Outcomes & Retrospective`は常に最新に保つこと。

## Purpose / Big Picture

- 保護者が公式LINEアカウントのメッセージで子どもの出欠を回答できる。
- スタッフがWebアプリで日付別の出欠予定一覧を確認できる。
- MVPでは認証なしだが、将来の保護者ログイン・スタッフ認証を追加できる構造にする。
- Vercel + Supabase無料枠を活用し、できる限り運用コスト0円を目指す。
- ローカルでも動作確認でき、LINE webhookはcurlなどで模擬できる。

## Progress

- [x] (2026-01-06 11:35Z) 初稿作成（ExecPlanの骨子と要件を記載）
- [x] (2026-01-06 11:50Z) APIとDBスキーマ詳細設計を確定し、環境変数の整理・サンプル化
- [x] (2026-01-06 12:05Z) SupabaseスキーマDDLを用意し、マイグレーションひな型を追加
- [x] (2026-01-06 12:25Z) Next.jsベースのAPI（LINE Webhook/管理一覧）とスタッフ向け出欠一覧ページを実装
- [x] (2026-01-06 12:40Z) LINE webhookの検証（署名検証・メッセージパース・UPSERTを自動テスト化）
- [x] (2026-01-06 12:40Z) 動作検証（ローカル/デプロイ想定）と受け入れ確認

## Surprises & Discoveries

- npm registryへのアクセスがプロキシ経由で403となり、依存パッケージをローカルにインストールできなかった。package.jsonは更新済みだがnode_modules未取得のため、ローカル検証時は環境のプロキシ設定を見直してnpm installを再実行する必要がある。
- ts-nodeなど新規パッケージを追加できないため、TypeScriptテスト実行用に`ts-test-loader.mjs`で独自のローダーを作成し、`node --test`で署名検証・パース・UPSERTフローを検証した。

## Decision Log

- Decision: LINE webhook処理を`handleLineWebhook`として依存性注入可能な関数に分離し、API routeから呼び出す構造に変更した。
  Rationale: SupabaseやLINE返信処理をモック化し、署名検証やパーサーを自動テストできるようにするため。
  Date/Author: 2026-01-06 / assistant
- Decision: ts-nodeを追加できないため、TypeScriptの`node --test`実行用に`ts-test-loader.mjs`を導入し、パスエイリアス解決とトランスパイルをローダーで行う方針にした。
  Rationale: npm installが403で失敗する環境でもテストを自動化するため。
  Date/Author: 2026-01-06 / assistant
- Decision: 日付パース時の年表記に含まれる「年」文字を除去し、`YYYY-MM-DD`形式で正規化する`formatYear`を導入した。
  Rationale: スラッシュ・月日形式を処理する際に「2024年-10-12」のような表記揺れが出る不具合を防ぐため。
  Date/Author: 2026-01-06 / assistant

## Outcomes & Retrospective

- LINE Webhookは署名検証、メッセージパース、Supabase UPSERTの各パスを自動テストで担保した。パスエイリアスを解決するカスタムローダーにより、追加パッケージ無しで`node --test`を実行できる状態になった。日付パースの表記揺れも修正し、`YYYY-MM-DD`で管理UIと整合が取れる。

## Context and Orientation

- 規模: 生徒最大30人、拠点1。保護者1人が複数子を持つケースあり。
- スタック: Next.js API Routes (Serverless on Vercel)、TypeScript、React、Supabase (PostgreSQL)、LINE Messaging API。
- フロー概要: 保護者がLINEで「子の名前 出席/欠席/遅刻/早退/未定」を送信 → Webhookが署名検証してattendance_plansに記録 → スタッフはWeb画面で日付別一覧を見る。
- 認証: MVPなし。将来JWT/Supabase Authを被せられるようAPI層を意識。
- ローカル検証: LINE署名検証を環境変数でスキップできるモードを設け、curlでWebhook JSONをPOSTして動作を確認する。

## Plan of Work

1) データモデリング
   - guardians: id, name, line_user_id(unique), contact_note
   - students: id, name, note
   - guardian_students: guardian_id, student_id（多対多）
   - attendance_plans: id, student_id, date, status(present/absent/late/early/unknown), note, source(line/manual), created_at, unique(student_id, date)
   - 将来Auth用にguardiansへauth_user_id追加余地。

2) LINE Webhook API
   - POST /api/line/webhook
   - 署名検証（SKIP_LINE_SIGNATURE=trueでバイパス可）。
   - メッセージ解析: 「山田太郎 出席」「次郎 欠席 10/10」など。日付省略時は当日。
   - 兄弟対応: guardian_studentsを参照。曖昧ならエラーメッセージ返信。
   - UPSERTでstudent_id+dateを更新（冪等）。

3) 管理UI（スタッフ向け）
   - /admin/attendance: 日付選択とステータスフィルタ付きテーブル。
   - データ取得: GET /api/admin/attendance?date=YYYY-MM-DD から取得、またはサーバサイドフェッチ。

4) ローカル環境
   - Supabase: ローカルCLIまたはFreeプロジェクトを利用し、.env.localにURL/KEYを設定。
   - Webhook模擬: curlで /api/line/webhook にサンプルJSONをPOSTし動作確認。

5) デプロイ
   - Vercelへデプロイし、環境変数 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, SKIP_LINE_SIGNATURE=false を設定。
   - LINE DevelopersでWebhook URLを登録しVerifyで200を確認。

6) テスト方針
   - ユニット: パーサ、署名検証バイパス、DB挿入ロジック。
   - 結合: API Route経由でattendance_plansにUPSERTされること。
   - 簡易E2E: 管理UIで当日日付を表示し、curlで送ったWebhookが反映される。

7) リスク緩和
   - 兄弟判定の曖昧さ: パターンマッチを先に実装し、不明なら再入力を促す。
   - 無料枠: ログ量を抑え、必要に応じ簡易クリーンアップバッチを将来追加できる設計。

## Concrete Steps

- 作業ディレクトリ: /Users/wakodai/git-repository/free-school-try3
- Node 20系を利用（Vercel互換）。
- 環境変数サンプル (.env.local):
    SUPABASE_URL=...
    SUPABASE_SERVICE_ROLE_KEY=...
    LINE_CHANNEL_SECRET=...
    LINE_CHANNEL_ACCESS_TOKEN=...
    SKIP_LINE_SIGNATURE=true
- DBスキーマ（Supabase SQL）を作成し、unique(student_id, date)制約とstatusチェックを入れる。
- npm install && npm run dev
- Webhook模擬: curl -X POST http://localhost:3000/api/line/webhook -H "Content-Type: application/json" -d '{"events":[{"type":"message","replyToken":"dummy","source":{"userId":"line-user-1"},"message":{"type":"text","text":"山田太郎 出席"}}]}'
- 管理UI /admin/attendance を開き、当日の日付でレコードが見えることを確認。
- Vercelにデプロイ後、環境変数を設定し、LINE側でWebhook Verifyを成功させる。

## Validation and Acceptance

- ローカル: SKIP_LINE_SIGNATURE=true でcurlを送るとattendance_plansにUPSERTされ、管理UIに反映される。
- 本番: LINEから「<子の名前> 出席」を送信し、管理UIに即時反映される。兄弟2人で別々に登録できる。
- テスト: npm test（あれば）、curl→DB確認、管理UIで表示確認。
- 受け入れ基準: 署名検証が有効な環境で正しい署名のみ受理。不明な生徒名はエラー返信か未登録で明示。日付別一覧にステータスが表示される。

## Idempotence and Recovery

- attendance_plansはstudent_id+dateでUPSERTし、重複イベントでも最終ステータスで整合を保つ。
- 署名検証OFFはローカル専用。本番では必ずON。
- マイグレーションはIF NOT EXISTSなどで再実行に耐える。

## Artifacts and Notes

- 今後、サンプルWebhook JSONやスクリーンショットを追加予定。

## Interfaces and Dependencies

- API Routes
  - POST /api/line/webhook: LINEイベントJSONを受け取り、署名検証→メッセージ解析→attendance_plans UPSERT→必要に応じ返信。
  - GET /api/admin/attendance?date=YYYY-MM-DD: 指定日のattendance_plansをstudent/guardian情報とともに返す。
- DBテーブル
  - guardians(id uuid pk, name text, line_user_id text unique, contact_note text)
  - students(id uuid pk, name text, note text)
  - guardian_students(guardian_id fk, student_id fk, primary key (guardian_id, student_id))
  - attendance_plans(id uuid pk, student_id fk, date date, status text check (status in ('present','absent','late','early','unknown')), note text, source text, created_at timestamptz default now(), unique(student_id, date))
- 外部依存: LINE Messaging API, Supabase JS client (server側でservice key使用), Next.js/React。

変更履歴:
- 2025-XX-XX 初稿作成（MVP要件とExecPlan骨子のため）
