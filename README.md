# 無料塾向けLINE出欠管理MVP

Next.js（App Router）とSupabaseを用いて、LINEメッセージから出欠予定を登録し、スタッフ向けに日付別の一覧を表示するMVPです。LINE Webhookで受信したテキストを解析し、Supabaseの`attendance_plans`テーブルへUPSERTした上で、管理UI `/admin/attendance` で確認できます。

## 主な機能
- LINE Messaging APIのWebhook (`/api/line/webhook`) で保護者からの出欠連絡を受信し、メッセージ本文をパースして日付・ステータスを決定。
- Supabaseのservice role keyを用いて`attendance_plans`にUPSERTし、同じ生徒+日付の重複を防止。
- 管理UI（スタッフ向け）で日付・ステータスを指定して一覧表示し、生徒と保護者情報を合わせて確認可能。

## 必要環境
- Node.js 20系
- Supabaseプロジェクト（PostgreSQL）。Service Role KeyとURLが必要です。
- （本番運用時）LINEチャネルのChannel Secret / Access Token

## セットアップ
1. 依存パッケージのインストール
   ```bash
   npm install
   ```
2. 環境変数を`.env.local`に設定
   ```bash
   SUPABASE_URL=your-supabase-url
   SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
   LINE_CHANNEL_SECRET=your-line-channel-secret
   LINE_CHANNEL_ACCESS_TOKEN=your-line-channel-access-token
   # ローカル検証で署名検証をスキップしたい場合はtrue
   SKIP_LINE_SIGNATURE=true
   ```
3. Supabaseスキーマの適用
   `supabase/migrations/0001_init.sql`をSupabaseコンソールやpsqlで実行して、テーブル（guardians / students / guardian_students / attendance_plans）を作成します。
4. 開発サーバーの起動
   ```bash
   npm run dev
   ```
   デフォルトで http://localhost:3000 で起動します。

## 利用方法
### LINE Webhook（/api/line/webhook）
- LINE DevelopersのWebhook URLにデプロイ先の`/api/line/webhook`を登録します。
- `SKIP_LINE_SIGNATURE=false`かつ`LINE_CHANNEL_SECRET`が設定されていれば署名検証を行います。ローカル検証では`SKIP_LINE_SIGNATURE=true`でバイパス可能です。
- メッセージ書式例
  - `山田太郎 出席`（日付省略時は当日扱い）
  - `山田花子 欠席 10/10` / `山田花子 早退 10月10日` など、スラッシュ・「月日」形式・YYYY-MM-DDに対応
- 生徒名は保護者に紐付く候補から部分一致で1件に絞り込みます。未登録・複数一致はエラーメッセージで返信します。
- 登録成功時は「<生徒名>の<日付>は「<ステータス>」で登録しました。」と返信します。

#### ローカルでのWebhook模擬
```bash
curl -X POST http://localhost:3000/api/line/webhook \
  -H "Content-Type: application/json" \
  -d '{"events":[{"type":"message","replyToken":"dummy","source":{"userId":"line-user-1"},"message":{"type":"text","text":"山田太郎 出席"}}]}'
```
`SKIP_LINE_SIGNATURE=true`をセットした上で実行してください。

### 管理UI（/admin/attendance）
- ブラウザで`/admin/attendance`にアクセスすると、指定日付・ステータスで`attendance_plans`を検索し、以下を表示します。
  - 生徒名と備考
  - 紐付く保護者名（複数表示）
  - 日付、ステータス（色付きピル表示）、備考
- デフォルトの日付は日本時間の当日です。

### 管理API（/api/admin/attendance）
- `GET /api/admin/attendance?date=YYYY-MM-DD&status=<present|absent|late|early|unknown>`
- `date`省略時は当日、`status`省略時は全件。JSON形式で`records`を返します。

## データモデル
`supabase/migrations/0001_init.sql`で作成される主なテーブルと制約:
- `guardians`: LINEユーザーIDと保護者名を保持
- `students`: 生徒名と備考を保持
- `guardian_students`: 保護者-生徒の多対多マッピング
- `attendance_plans`: 生徒ごとの日付別ステータス。`unique(student_id, date)`でUPSERTを担保、`status`は`present/absent/late/early/unknown`に制限

## デプロイのポイント
- VercelなどのホスティングでNext.jsをデプロイすることを想定しています。
- 必要な環境変数（Supabase URL/Service Role Key、LINE Channel Secret/Access Token、SKIP_LINE_SIGNATURE）を環境に登録してください。
- 本番では`SKIP_LINE_SIGNATURE=false`とし、LINEからの署名検証を必須化します。
