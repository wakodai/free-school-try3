import { NextRequest, NextResponse } from 'next/server';
import { supabaseServerClient } from '@/lib/supabaseClient';
import type { AttendanceWithStudent } from '@/types/attendance';

function formatToday() {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date()).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') ?? formatToday();
  const statusFilter = searchParams.get('status') ?? undefined;

  let query = supabaseServerClient
    .from('attendance_plans')
    .select(
      `id, student_id, date, status, note, source, created_at, students:students ( id, name, note, guardian_students ( guardian_id, guardians ( name, line_user_id ) ) )`
    )
    .eq('date', date)
    .order('created_at', { ascending: false });

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ message: 'fetch failed', error: error.message }, { status: 500 });
  }

  const records: AttendanceWithStudent[] = (data ?? []).map((row: any) => ({
    id: row.id,
    student_id: row.student_id,
    date: row.date,
    status: row.status,
    note: row.note,
    source: row.source,
    created_at: row.created_at,
    student: row.students
      ? {
          id: row.students.id,
          name: row.students.name,
          note: row.students.note,
          guardians: (row.students.guardian_students ?? []).map((gs: any) => ({
            guardian_id: gs.guardian_id,
            guardian_name: gs.guardians?.name,
            line_user_id: gs.guardians?.line_user_id,
          })),
        }
      : undefined,
  }));

  return NextResponse.json({ date, records });
}
