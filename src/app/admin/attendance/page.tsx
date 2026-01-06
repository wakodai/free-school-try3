import Link from 'next/link';
import { AttendanceTable } from './AttendanceTable';

export const metadata = {
  title: 'スタッフ向け出欠一覧',
};

export default function AttendancePage() {
  return (
    <div className="stack">
      <nav>
        <Link href="/">← ホームに戻る</Link>
      </nav>
      <AttendanceTable />
    </div>
  );
}
