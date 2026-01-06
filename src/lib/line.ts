import { createHmac, timingSafeEqual } from 'crypto';
import type { AttendanceStatus } from '@/types/attendance';

const STATUS_KEYWORDS: Record<string, AttendanceStatus> = {
  '出席': 'present',
  '出': 'present',
  '欠席': 'absent',
  '欠': 'absent',
  '遅刻': 'late',
  '遅': 'late',
  '早退': 'early',
  '早': 'early',
  '未定': 'unknown',
  '未': 'unknown',
};

function formatDate(date: Date) {
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

function formatYear(date: Date) {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
  });
  const parts = formatter.formatToParts(date).find((part) => part.type === 'year');
  return parts?.value ?? `${date.getFullYear()}`;
}

export function parseDateToken(token: string | undefined, today: Date) {
  if (!token) return formatDate(today);
  const trimmed = token.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (slashMatch) {
    const [, m, d] = slashMatch;
    const year = formatYear(today);
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const kanjiMatch = trimmed.match(/^(\d{1,2})月(\d{1,2})日$/);
  if (kanjiMatch) {
    const [, m, d] = kanjiMatch;
    const year = formatYear(today);
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return formatDate(today);
}

export interface ParsedMessageResult {
  studentName: string;
  status: AttendanceStatus;
  date: string;
}

export function parseLineText(text: string, today = new Date()): ParsedMessageResult {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const tokens = normalized.split(' ');
  const statusIndex = tokens.findIndex((token) => STATUS_KEYWORDS[token]);

  const status = statusIndex >= 0 ? STATUS_KEYWORDS[tokens[statusIndex]] : 'unknown';
  const nameTokens = statusIndex >= 0 ? tokens.slice(0, statusIndex) : tokens.slice(0, Math.max(tokens.length - 1, 1));
  const studentName = nameTokens.join(' ').trim();
  const dateToken = statusIndex >= 0 ? tokens[statusIndex + 1] : tokens[1];

  return {
    studentName,
    status,
    date: parseDateToken(dateToken, today),
  };
}

export function verifyLineSignature(rawBody: string, signature: string | null) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) {
    throw new Error('LINE_CHANNEL_SECRET is required when signature verification is enabled');
  }
  if (!signature) return false;
  const hmac = createHmac('SHA256', secret);
  hmac.update(rawBody);
  const digest = hmac.digest('base64');
  const expected = Buffer.from(digest);
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function statusLabel(status: AttendanceStatus) {
  switch (status) {
    case 'present':
      return '出席';
    case 'absent':
      return '欠席';
    case 'late':
      return '遅刻';
    case 'early':
      return '早退';
    default:
      return '未定';
  }
}

export function statusClassName(status: AttendanceStatus) {
  return `status-pill status-${status}`;
}
