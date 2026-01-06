import type { AttendanceStatus } from '@/types/attendance';
import { parseLineText, statusLabel, verifyLineSignature } from './line';

type LineMessageEvent = {
  type: 'message';
  replyToken?: string;
  source?: {
    userId?: string;
  };
  message?: {
    type: string;
    text?: string;
  };
};

type LineWebhookPayload = {
  events?: LineMessageEvent[];
};

export type ResolvedStudent = { student_id: string; student_name: string } | { error: string };

export interface LineWebhookDependencies {
  resolveStudent: (
    lineUserId: string | undefined,
    studentName: string
  ) => Promise<ResolvedStudent>;
  upsertAttendance: (
    studentId: string,
    date: string,
    status: AttendanceStatus,
    note?: string
  ) => Promise<{ error?: string | null }>;
  replyMessage?: (replyToken: string | undefined, message: string) => Promise<void>;
  verifySignature?: (rawBody: string, signature: string | null) => boolean;
  skipSignature?: boolean;
  today?: Date;
}

export interface LineWebhookResult {
  status: number;
  body: { ok: boolean; results: Array<{ status: string; message: string }> };
}

export async function handleLineWebhook(
  rawBody: string,
  headers: Headers,
  deps: LineWebhookDependencies
): Promise<LineWebhookResult> {
  const {
    skipSignature = false,
    verifySignature: verifySignatureFn = verifyLineSignature,
    resolveStudent,
    upsertAttendance,
    replyMessage = async () => {},
    today = new Date(),
  } = deps;

  if (!skipSignature) {
    const signature = headers.get('x-line-signature');
    const verified = verifySignatureFn(rawBody, signature);
    if (!verified) {
      return { status: 401, body: { ok: false, results: [{ status: 'error', message: 'invalid signature' }] } };
    }
  }

  let payload: LineWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as LineWebhookPayload;
  } catch (error) {
    return {
      status: 400,
      body: { ok: false, results: [{ status: 'error', message: `invalid body: ${String(error)}` }] },
    };
  }

  const events = payload.events ?? [];
  const results = [] as Array<{ status: string; message: string }>;

  for (const event of events) {
    if (event.type !== 'message' || event.message?.type !== 'text' || !event.message.text) {
      results.push({ status: 'skipped', message: 'テキストメッセージ外をスキップしました。' });
      continue;
    }

    const parsed = parseLineText(event.message.text, today);
    const student = await resolveStudent(event.source?.userId, parsed.studentName);
    if ('error' in student) {
      results.push({ status: 'error', message: student.error });
      await replyMessage(event.replyToken, student.error);
      continue;
    }

    const { error } = await upsertAttendance(student.student_id, parsed.date, parsed.status);
    if (error) {
      results.push({ status: 'error', message: error });
      await replyMessage(event.replyToken, '登録に失敗しました。時間をおいて再度お試しください。');
      continue;
    }

    const statusText = statusLabel(parsed.status);
    const successMessage = `${student.student_name}の${parsed.date}は「${statusText}」で登録しました。`;
    results.push({ status: 'ok', message: successMessage });
    await replyMessage(event.replyToken, successMessage);
  }

  return { status: 200, body: { ok: true, results } };
}
