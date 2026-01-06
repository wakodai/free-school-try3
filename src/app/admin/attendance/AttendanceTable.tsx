'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AttendanceWithStudent, AttendanceStatus } from '@/types/attendance';
import { statusClassName, statusLabel } from '@/lib/line';

interface ApiResponse {
  date: string;
  records: AttendanceWithStudent[];
}

const statusOptions: { value: AttendanceStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'present', label: '出席' },
  { value: 'absent', label: '欠席' },
  { value: 'late', label: '遅刻' },
  { value: 'early', label: '早退' },
  { value: 'unknown', label: '未定' },
];

function shiftDate(date: string, offset: number) {
  const base = new Date(date);
  base.setDate(base.getDate() + offset);
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(base).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function AttendanceTable() {
  const today = useMemo(() => new Date(), []);
  const defaultDate = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(today).reduce<Record<string, string>>((acc, part) => {
      if (part.type !== 'literal') {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }, [today]);

  const [date, setDate] = useState(defaultDate);
  const [status, setStatus] = useState<AttendanceStatus | 'all'>('all');
  const [records, setRecords] = useState<AttendanceWithStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useDemo, setUseDemo] = useState(false);

  const demoRecords = useMemo<AttendanceWithStudent[]>(() => {
    const tomorrow = shiftDate(defaultDate, 1);
    return [
      {
        id: 'demo-1',
        student_id: 'student-sato-taro',
        date: defaultDate,
        status: 'present',
        note: 'LINE連携: 佐藤 花子さんからの出席',
        source: 'line',
        student: {
          id: 'student-sato-taro',
          name: '佐藤 太郎',
          guardians: [{ guardian_id: 'g-sato', guardian_name: '佐藤 花子' }],
        },
      },
      {
        id: 'demo-2',
        student_id: 'student-takahashi-yuna',
        date: defaultDate,
        status: 'late',
        note: '18:00頃に到着予定（部活後）',
        source: 'line',
        student: {
          id: 'student-takahashi-yuna',
          name: '高橋 結菜',
          guardians: [{ guardian_id: 'g-takahashi', guardian_name: '高橋 健' }],
        },
      },
      {
        id: 'demo-3',
        student_id: 'student-chen-kou',
        date: tomorrow,
        status: 'absent',
        note: '風邪のため欠席。LINEから申請済み',
        source: 'line',
        student: {
          id: 'student-chen-kou',
          name: '陳 コウ',
          guardians: [{ guardian_id: 'g-chen', guardian_name: '陳 美咲' }],
        },
      },
    ];
  }, [defaultDate]);

  useEffect(() => {
    const fetchRecords = async () => {
      setLoading(true);
      setError(null);
      if (useDemo) {
        const filtered = demoRecords.filter((record) => {
          const statusOk = status === 'all' || record.status === status;
          return record.date === date && statusOk;
        });
        setRecords(filtered);
        setLoading(false);
        return;
      }

      try {
        const params = new URLSearchParams({ date });
        if (status !== 'all') {
          params.set('status', status);
        }
        const res = await fetch(`/api/admin/attendance?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`API error ${res.status}`);
        }
        const body: ApiResponse = await res.json();
        setRecords(body.records ?? []);
      } catch (err) {
        setError((err as Error).message);
        setUseDemo(true);
      } finally {
        setLoading(false);
      }
    };

    fetchRecords();
  }, [date, status, useDemo, demoRecords]);

  return (
    <div className="card">
      <div className="header-row">
        <h1>日付別 出欠一覧</h1>
        <div className="header-actions">
          <button className="btn btn-ghost" onClick={() => setUseDemo((prev) => !prev)}>
            {useDemo ? 'APIを読み込む' : 'ダミーデータを表示'}
          </button>
          {useDemo && <span className="pill">デモ表示中</span>}
        </div>
      </div>
      <p className="muted">
        Supabase接続がまだ無い場合でも、ダミーデータでレイアウトを確認できます。APIエラー時は自動でデモ表示に切り替わります。
      </p>
      <div className="filter-bar">
        <label>
          日付
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          ステータス
          <select value={status} onChange={(e) => setStatus(e.target.value as AttendanceStatus | 'all')}>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && <p className="muted">読み込み中...</p>}
      {error && !useDemo && <p className="muted">{error}</p>}
      {useDemo && <p className="muted">ダミーデータを表示しています。</p>}

      {!loading && !error && (
        <div>
          {records.length === 0 ? (
            <p className="muted">該当するレコードがありません。</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>生徒</th>
                  <th>保護者</th>
                  <th>日付</th>
                  <th>ステータス</th>
                  <th>備考</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <div>{record.student?.name ?? '不明'}</div>
                      {record.student?.note && <div className="muted">{record.student.note}</div>}
                    </td>
                    <td>
                      {record.student?.guardians?.length ? (
                        record.student.guardians.map((guardian) => (
                          <div key={guardian.guardian_id} className="muted">
                            {guardian.guardian_name || '保護者名未設定'}
                          </div>
                        ))
                      ) : (
                        <div className="muted">未登録</div>
                      )}
                    </td>
                    <td>{record.date}</td>
                    <td>
                      <span className={statusClassName(record.status)}>{statusLabel(record.status)}</span>
                    </td>
                    <td>{record.note ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
