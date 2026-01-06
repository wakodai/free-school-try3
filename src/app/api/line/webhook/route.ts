import { NextRequest, NextResponse } from 'next/server';
import { supabaseServerClient } from '@/lib/supabaseClient';
import { verifyLineSignature } from '@/lib/line';
import { handleLineWebhook } from '@/lib/lineWebhook';
import type { AttendanceStatus } from '@/types/attendance';

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
  const result = await handleLineWebhook(rawBody, req.headers, {
    skipSignature,
    verifySignature,
    resolveStudent,
    upsertAttendance,
    replyMessage,
  });
  return NextResponse.json(result.body, { status: result.status });
}
