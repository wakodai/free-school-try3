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

  useEffect(() => {
    const fetchRecords = async () => {
      setLoading(true);
      setError(null);
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
      } finally {
        setLoading(false);
      }
    };

    fetchRecords();
  }, [date, status]);

  return (
    <div className="card">
      <h1>日付別 出欠一覧</h1>
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
      {error && <p className="muted">{error}</p>}

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
