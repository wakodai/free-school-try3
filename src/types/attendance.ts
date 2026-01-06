export type AttendanceStatus = 'present' | 'absent' | 'late' | 'early' | 'unknown';

export interface AttendancePlan {
  id: string;
  student_id: string;
  date: string;
  status: AttendanceStatus;
  note?: string | null;
  source?: string | null;
  created_at?: string;
}

export interface StudentWithGuardians {
  id: string;
  name: string;
  note?: string | null;
  guardians?: Array<{
    guardian_id: string;
    guardian_name: string;
    line_user_id?: string | null;
  }>;
}

export interface AttendanceWithStudent extends AttendancePlan {
  student?: StudentWithGuardians;
}
