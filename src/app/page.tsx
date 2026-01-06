import Link from 'next/link';

export default function Home() {
  return (
    <div className="stack">
      <section className="card">
        <h1>無料塾 出欠管理MVP</h1>
        <p className="muted">
          LINEから送信された出欠情報をSupabaseに格納し、スタッフ向け一覧ページで確認するMVPです。
        </p>
        <div className="badge">Next.js API Routes / Supabase / LINE Messaging API</div>
      </section>
      <section className="card">
        <h2>ナビゲーション</h2>
        <ul>
          <li>
            <Link href="/admin/attendance">スタッフ向け 出欠一覧</Link>
          </li>
          <li>
            <Link href="/line-simulator">保護者向け 出欠申請デモ（LINEモック）</Link>
          </li>
          <li>
            API: <code>/api/line/webhook</code> (LINE Webhook),{' '}
            <code>/api/admin/attendance</code> (出欠一覧取得)
          </li>
        </ul>
      </section>
    </div>
  );
}
