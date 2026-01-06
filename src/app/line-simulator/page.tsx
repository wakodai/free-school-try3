'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { statusLabel } from '@/lib/line';
import type { AttendanceStatus } from '@/types/attendance';

type ChatSender = 'guardian' | 'bot';

type ChatMessage = {
  id: string;
  sender: ChatSender;
  text: string;
  timestamp: string;
  tone?: 'success' | 'error' | 'info';
};

type GuardianProfile = {
  name: string;
  lineUserId: string;
  students: Array<{ name: string; note?: string }>;
};

type SimulatorResponse = {
  ok: boolean;
  mode?: 'supabase' | 'demo' | 'demo-error';
  guardianName?: string;
  requestText?: string;
  results?: Array<{ status: string; message: string }>;
};

const statusOptions: { value: AttendanceStatus; label: string; detail: string }[] = [
  { value: 'present', label: '出席', detail: '通常通り参加' },
  { value: 'absent', label: '欠席', detail: '休みます' },
  { value: 'late', label: '遅刻', detail: '少し遅れます' },
  { value: 'early', label: '早退', detail: '途中で帰ります' },
  { value: 'unknown', label: '未定', detail: 'まだ未確定' },
];

const sampleGuardians: GuardianProfile[] = [
  {
    name: '佐藤 花子',
    lineUserId: 'line-guardian-sato',
    students: [
      { name: '佐藤 太郎', note: '小5・算数が得意' },
      { name: '佐藤 真央', note: '中1・部活後に来ることあり' },
    ],
  },
  {
    name: '高橋 健',
    lineUserId: 'line-guardian-takahashi',
    students: [
      { name: '高橋 結菜', note: '小6・弟と一緒に参加' },
      { name: '高橋 蒼', note: '小3・保護者同伴' },
    ],
  },
  {
    name: '陳 美咲',
    lineUserId: 'line-guardian-chen',
    students: [{ name: '陳 コウ', note: '中2・英語レベルチェック希望' }],
  },
];

function buildId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDateForInput(date: Date) {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatClock(time: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(time));
}

export default function LineSimulatorPage() {
  const defaultDate = useMemo(() => formatDateForInput(new Date()), []);
  const [selectedGuardian, setSelectedGuardian] = useState<GuardianProfile>(sampleGuardians[0]);
  const [selectedStudent, setSelectedStudent] = useState<string>(sampleGuardians[0].students[0].name);
  const [status, setStatus] = useState<AttendanceStatus>('present');
  const [date, setDate] = useState<string>(defaultDate);
  const [note, setNote] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<'supabase' | 'demo' | 'demo-error' | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: buildId(),
      sender: 'bot',
      tone: 'info',
      text: 'こんにちは！LINE公式アカウントの代わりに、ここで出欠を入力してみましょう。',
      timestamp: new Date().toISOString(),
    },
    {
      id: buildId(),
      sender: 'bot',
      tone: 'info',
      text: 'ステータスボタンと日付を選び、「この内容で送信」を押すと、Webhookと同じ処理を呼び出します。',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [lastPayload, setLastPayload] = useState<string>('');
  const [apiError, setApiError] = useState<string | null>(null);

  const handleGuardianChange = (guardian: GuardianProfile) => {
    setSelectedGuardian(guardian);
    const nextStudent = guardian.students[0];
    if (nextStudent) {
      setSelectedStudent(nextStudent.name);
    }
  };

  const appendMessages = (items: ChatMessage[]) => {
    setMessages((prev) => [...prev, ...items]);
  };

  const handleSend = async () => {
    const now = new Date().toISOString();
    const trimmedStudent = selectedStudent.trim();
    if (!trimmedStudent) {
      appendMessages([
        {
          id: buildId(),
          sender: 'bot',
          tone: 'error',
          text: '生徒名を入力してください。',
          timestamp: now,
        },
      ]);
      return;
    }

    const requestText = `${trimmedStudent} ${statusLabel(status)} ${date}${note ? ` ${note}` : ''}`;
    appendMessages([
      {
        id: buildId(),
        sender: 'guardian',
        text: requestText,
        timestamp: now,
      },
    ]);

    setSending(true);
    setApiError(null);

    try {
      const res = await fetch('/api/mock/line-simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guardianName: selectedGuardian.name,
          lineUserId: selectedGuardian.lineUserId,
          studentName: trimmedStudent,
          status,
          date,
          note,
        }),
      });

      const data = (await res.json()) as SimulatorResponse;
      setMode(data.mode ?? 'demo');
      setLastPayload(data.requestText ?? requestText);

      const resultMessages = (data.results ?? []).map<ChatMessage>((item) => ({
        id: buildId(),
        sender: 'bot',
        tone: item.status === 'ok' ? 'success' : item.status === 'error' ? 'error' : 'info',
        text: item.message,
        timestamp: new Date().toISOString(),
      }));

      if (resultMessages.length === 0) {
        resultMessages.push({
          id: buildId(),
          sender: 'bot',
          tone: 'info',
          text: 'レスポンスがありませんでした。',
          timestamp: new Date().toISOString(),
        });
      }

      appendMessages(resultMessages);
    } catch (error) {
      const message = (error as Error).message;
      setApiError(message);
      appendMessages([
        {
          id: buildId(),
          sender: 'bot',
          tone: 'error',
          text: `送信に失敗しました: ${message}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="stack">
      <nav>
        <Link href="/">← ホームに戻る</Link>
      </nav>

      <section className="card">
        <div className="section-header">
          <div>
            <p className="badge">LINE公式アカウント 模擬画面</p>
            <h1>保護者向け 出欠申請デモ</h1>
            <p className="muted">
              ステータスボタンと日付を選んで送信すると、LINE Webhookと同じ処理が呼ばれます。Supabase未接続でもデモモードで応答します。
            </p>
          </div>
          <div className="status-stack">
            {mode && (
              <span className="pill">
                {mode === 'supabase' ? 'Supabaseに書き込み' : 'デモモードで応答'}
              </span>
            )}
            {apiError && <span className="pill pill-error">{apiError}</span>}
          </div>
        </div>
      </section>

      <div className="line-sim-grid">
        <section className="card line-sim-chat">
          <header className="chat-header">
            <div>
              <div className="muted">保護者: {selectedGuardian.name}</div>
              <div className="muted">LINEユーザーID: {selectedGuardian.lineUserId}</div>
            </div>
            <div className="pill">チャットプレビュー</div>
          </header>
          <div className="chat-window">
            {messages.map((msg) => (
              <div key={msg.id} className={`chat-row ${msg.sender === 'guardian' ? 'chat-row-right' : ''}`}>
                <div className={`chat-bubble chat-${msg.sender} ${msg.tone ? `chat-${msg.tone}` : ''}`}>
                  <div className="chat-text">{msg.text}</div>
                  <div className="chat-meta">{formatClock(msg.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card line-sim-panel">
          <div className="panel-section">
            <h3>保護者を選ぶ</h3>
            <div className="chip-row">
              {sampleGuardians.map((guardian) => (
                <button
                  key={guardian.lineUserId}
                  className={`chip-button ${guardian.lineUserId === selectedGuardian.lineUserId ? 'chip-active' : ''}`}
                  onClick={() => handleGuardianChange(guardian)}
                >
                  <span className="chip-title">{guardian.name}</span>
                  <span className="muted chip-sub">LINE ID: {guardian.lineUserId}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="panel-section">
            <h3>生徒を選ぶ</h3>
            <div className="chip-row">
              {selectedGuardian.students.map((student) => (
                <button
                  key={student.name}
                  className={`chip-button ${student.name === selectedStudent ? 'chip-active' : ''}`}
                  onClick={() => setSelectedStudent(student.name)}
                >
                  <span className="chip-title">{student.name}</span>
                  {student.note && <span className="muted chip-sub">{student.note}</span>}
                </button>
              ))}
            </div>
            <label className="field">
              直接入力
              <input
                type="text"
                value={selectedStudent}
                onChange={(e) => setSelectedStudent(e.target.value)}
                placeholder="例: 佐藤 太郎"
              />
            </label>
          </div>

          <div className="panel-section">
            <h3>ステータスと日付</h3>
            <div className="status-grid">
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  className={`status-button ${status === option.value ? 'status-active' : ''}`}
                  onClick={() => setStatus(option.value)}
                >
                  <div className="status-title">{option.label}</div>
                  <div className="muted status-sub">{option.detail}</div>
                </button>
              ))}
            </div>
            <div className="field-row">
              <label className="field">
                日付
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="field">
                メモ（任意）
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="例: 部活後に参加、18時頃"
                />
              </label>
            </div>
          </div>

          <div className="panel-section send-row">
            <div>
              <div className="muted">送信する内容</div>
              <div className="preview-text">
                {selectedStudent || '生徒名未入力'} / {statusLabel(status)} / {date}
                {note ? ` / ${note}` : ''}
              </div>
            </div>
            <button className="btn btn-primary" onClick={handleSend} disabled={sending}>
              {sending ? '送信中...' : 'この内容で送信'}
            </button>
          </div>

          {lastPayload && (
            <div className="panel-section">
              <h4>送信したメッセージ例</h4>
              <div className="payload-box">{lastPayload}</div>
              {mode === 'supabase' ? (
                <p className="muted">SupabaseへのUPSERTを試みました。</p>
              ) : (
                <p className="muted">環境変数が無い場合はデモモードでレスポンスを返しています。</p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
