import { NextRequest, NextResponse } from 'next/server';
import { supabaseServerClient } from '@/lib/supabaseClient';
import { parseLineText, statusLabel, verifyLineSignature } from '@/lib/line';
import type { AttendanceStatus } from '@/types/attendance';

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

const skipSignature = process.env.SKIP_LINE_SIGNATURE === 'true';

async function replyMessage(replyToken: string | undefined, message: string) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!replyToken || !accessToken) return;
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text: message }],
    }),
  });
}

async function resolveStudent(lineUserId: string | undefined, studentName: string) {
  if (!lineUserId) {
    return { error: 'LINEユーザーIDが取得できませんでした。' } as const;
  }

  const { data, error } = await supabaseServerClient
    .from('guardians')
    .select(
      `id, name, line_user_id, guardian_students( student_id, students ( id, name, note ) )`
    )
    .eq('line_user_id', lineUserId)
    .maybeSingle();

  if (error || !data) {
    return { error: '保護者の登録が見つかりません。スタッフに連絡してください。' } as const;
  }

  const candidates = (data.guardian_students ?? []).flatMap((gs) => {
    if (!gs?.students) return [] as const;
    return [
      {
        student_id: gs.students.id as string,
        student_name: (gs.students.name as string) ?? '',
      },
    ];
  });

  if (candidates.length === 0) {
    return { error: '紐付く生徒情報がありません。スタッフに連絡してください。' } as const;
  }

  const normalizedTarget = studentName.replace(/\s+/g, '').toLowerCase();
  const matched = candidates.filter((candidate) =>
    candidate.student_name.replace(/\s+/g, '').toLowerCase().includes(normalizedTarget)
  );

  if (matched.length === 0) {
    return { error: `生徒名「${studentName}」が見つかりません。フルネームで入力してください。` } as const;
  }
  if (matched.length > 1) {
    return { error: `複数の生徒が一致しました。どの生徒か明記してください。` } as const;
  }

  return matched[0];
}

async function upsertAttendance(
  studentId: string,
  date: string,
  status: AttendanceStatus,
  note?: string
) {
  const { error } = await supabaseServerClient
    .from('attendance_plans')
    .upsert(
      {
        id: crypto.randomUUID(),
        student_id: studentId,
        date,
        status,
        note,
        source: 'line',
      },
      { onConflict: 'student_id,date' }
    );
  return { error: error?.message };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (!skipSignature) {
    const signature = req.headers.get('x-line-signature');
    const verified = verifyLineSignature(rawBody, signature);
    if (!verified) {
      return NextResponse.json({ message: 'invalid signature' }, { status: 401 });
    }
  }

  let payload: LineWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as LineWebhookPayload;
  } catch (error) {
    return NextResponse.json({ message: 'invalid body', error: String(error) }, { status: 400 });
  }

  const events = payload.events ?? [];
  const today = new Date();
  const results = [] as Array<{ status: string; message: string }>;

  for (const event of events) {
    if (event.type !== 'message' || event.message?.type !== 'text' || !event.message.text) {
      results.push({ status: 'skipped', message: 'テキストメッセージ以外をスキップしました。' });
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

  return NextResponse.json({ ok: true, results });
}
