import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { handleLineWebhook } from '@/lib/lineWebhook';
import { statusLabel } from '@/lib/line';
import type { AttendanceStatus } from '@/types/attendance';

interface MockRequestBody {
  guardianName?: string;
  lineUserId?: string;
  studentName?: string;
  status?: AttendanceStatus;
  date?: string;
  note?: string;
}

function buildSupabaseClient(): SupabaseClient | null {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  try {
    return createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  } catch (error) {
    console.error('Failed to initialize supabase client', error);
    return null;
  }
}

async function resolveStudentWithSupabase(
  client: SupabaseClient,
  lineUserId: string | undefined,
  studentName: string
) {
  if (!lineUserId) {
    return { error: 'LINEユーザーIDが取得できませんでした。' } as const;
  }

  const { data, error } = await client
    .from('guardians')
    .select(`id, name, line_user_id, guardian_students( student_id, students ( id, name, note ) )`)
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

async function upsertAttendanceWithSupabase(
  client: SupabaseClient,
  studentId: string,
  date: string,
  status: AttendanceStatus,
  note?: string
) {
  const { error } = await client
    .from('attendance_plans')
    .upsert(
      {
        id: randomUUID(),
        student_id: studentId,
        date,
        status,
        note,
        source: 'line-mock',
      },
      { onConflict: 'student_id,date' }
    );

  return { error: error?.message };
}

function buildDemoResolvers(studentName: string) {
  const safeName = studentName || 'デモ生徒';
  return {
    resolveStudent: async () => ({
      student_id: `demo-${safeName.replace(/\s+/g, '-').toLowerCase()}`,
      student_name: safeName,
    }),
    upsertAttendance: async () => ({ error: null }),
    mode: 'demo' as const,
  };
}

export async function POST(req: NextRequest) {
  let body: MockRequestBody;
  try {
    body = (await req.json()) as MockRequestBody;
  } catch (error) {
    return NextResponse.json({ ok: false, message: `invalid json: ${String(error)}` }, { status: 400 });
  }

  const status: AttendanceStatus = body.status ?? 'unknown';
  const guardianName = (body.guardianName ?? '保護者').trim();
  const studentName = (body.studentName ?? '生徒名未入力').trim() || '生徒名未入力';
  const lineUserId = (body.lineUserId ?? '').trim() || `demo-${guardianName.replace(/\s+/g, '-').toLowerCase()}`;
  const date = body.date?.trim();
  const note = body.note?.trim();

  const statusText = statusLabel(status);
  const messageTokens = [studentName, statusText];
  if (date) messageTokens.push(date);
  if (note) messageTokens.push(note);
  const messageText = messageTokens.join(' ');

  const supabase = buildSupabaseClient();
  const today = date ? new Date(`${date}T00:00:00+09:00`) : new Date();

  const demoResolvers = buildDemoResolvers(studentName);
  const resolveStudent = supabase
    ? (lineUserIdArg: string | undefined, studentNameArg: string) =>
        resolveStudentWithSupabase(supabase, lineUserIdArg, studentNameArg)
    : demoResolvers.resolveStudent;
  const upsertAttendance = supabase
    ? (studentId: string, parsedDate: string, parsedStatus: AttendanceStatus) =>
        upsertAttendanceWithSupabase(supabase, studentId, parsedDate, parsedStatus, note)
    : demoResolvers.upsertAttendance;

  try {
    const payload = JSON.stringify({
      events: [
        {
          type: 'message',
          replyToken: 'mock-reply-token',
          source: { userId: lineUserId },
          message: { type: 'text', text: messageText },
        },
      ],
    });

    const result = await handleLineWebhook(payload, new Headers(), {
      skipSignature: true,
      resolveStudent,
      upsertAttendance,
      replyMessage: async () => {},
      today,
    });

    return NextResponse.json({
      ok: result.body.ok,
      mode: supabase ? 'supabase' : demoResolvers.mode,
      guardianName,
      requestText: messageText,
      results: result.body.results,
    });
  } catch (error) {
    console.error('Mock LINE simulator failed', error);
    return NextResponse.json(
      {
        ok: true,
        mode: 'demo-error',
        guardianName,
        requestText: messageText,
        results: [
          {
            status: 'error',
            message: 'サーバー側でエラーが発生しましたが、デモモードで応答しました。',
          },
        ],
      },
      { status: 200 }
    );
  }
}
