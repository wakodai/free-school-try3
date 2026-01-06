import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'crypto';
import { handleLineWebhook } from '../src/lib/lineWebhook.ts';
import type { AttendanceStatus } from '../src/types/attendance.ts';

type MockUpsert = { studentId: string; date: string; status: AttendanceStatus };

const fixedToday = new Date('2024-10-10T02:34:56+09:00');

function buildBody(text: string, userId = 'guardian-1') {
  return JSON.stringify({
    events: [
      {
        type: 'message',
        replyToken: 'dummy-reply',
        source: { userId },
        message: { type: 'text', text },
      },
    ],
  });
}

test('正常に署名バイパスしてUPSERTと返信メッセージを行う', async () => {
  const upserts: MockUpsert[] = [];
  const replies: string[] = [];

  const body = buildBody('山田太郎 出席');
  const result = await handleLineWebhook(body, new Headers(), {
    skipSignature: true,
    today: fixedToday,
    resolveStudent: async () => ({ student_id: 'student-1', student_name: '山田太郎' }),
    upsertAttendance: async (studentId, date, status) => {
      upserts.push({ studentId, date, status });
      return {};
    },
    replyMessage: async (_replyToken, message) => {
      replies.push(message);
    },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.results, [
    { status: 'ok', message: '山田太郎の2024-10-10は「出席」で登録しました。' },
  ]);
  assert.deepEqual(upserts, [{ studentId: 'student-1', date: '2024-10-10', status: 'present' }]);
  assert.deepEqual(replies, ['山田太郎の2024-10-10は「出席」で登録しました。']);
});

test('署名検証が無効な場合は401で処理を打ち切る', async () => {
  process.env.LINE_CHANNEL_SECRET = 'secret-key';
  const badBody = buildBody('山田太郎 出席');
  const headers = new Headers();
  headers.set('x-line-signature', 'invalid');

  const result = await handleLineWebhook(badBody, headers, {
    skipSignature: false,
    resolveStudent: async () => ({ student_id: 'student-1', student_name: '山田太郎' }),
    upsertAttendance: async () => ({ error: null }),
    replyMessage: async () => {},
  });

  assert.equal(result.status, 401);
  assert.deepEqual(result.body.results[0].message, 'invalid signature');
});

test('署名が正しい場合はパースとUPSERTに進む', async () => {
  process.env.LINE_CHANNEL_SECRET = 'secret-key';
  const goodBody = buildBody('山田太郎 欠席 10/12');
  const signature = createHmac('SHA256', 'secret-key').update(goodBody).digest('base64');
  const headers = new Headers();
  headers.set('x-line-signature', signature);

  const upserts: MockUpsert[] = [];
  const result = await handleLineWebhook(goodBody, headers, {
    skipSignature: false,
    today: fixedToday,
    resolveStudent: async () => ({ student_id: 'student-1', student_name: '山田太郎' }),
    upsertAttendance: async (studentId, date, status) => {
      upserts.push({ studentId, date, status });
      return {};
    },
  });

  assert.equal(result.status, 200);
  assert.equal(upserts.length, 1);
  assert.deepEqual(upserts[0], {
    studentId: 'student-1',
    date: '2024-10-12',
    status: 'absent',
  });
});

test('生徒が解決できない場合はエラーメッセージで返信する', async () => {
  const replies: string[] = [];
  const body = buildBody('山田太郎 出席');

  const result = await handleLineWebhook(body, new Headers(), {
    skipSignature: true,
    resolveStudent: async () => ({ error: '生徒が見つかりません' }),
    upsertAttendance: async () => ({ error: null }),
    replyMessage: async (_token, message) => {
      replies.push(message);
    },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.results, [{ status: 'error', message: '生徒が見つかりません' }]);
  assert.deepEqual(replies, ['生徒が見つかりません']);
});
