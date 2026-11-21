export interface AuthUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export interface Classroom {
  id: string;
  name: string;
  code: string;
  academicYearId: string;
  rankingMode: 'TOTAL_SCORE' | 'AVERAGE_SCORE';
  role: 'HOMEROOM_TEACHER' | 'TEAM_LEADER' | 'STUDENT';
  academicYear: { id: string; name: string; startDate: string; endDate: string };
}

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface CompetitionWeek {
  id: string;
  classroomId: string;
  name: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
}

export interface Criterion {
  id: string;
  classroomId: string;
  code: string;
  name: string;
  description: string | null;
  type: 'BONUS' | 'PENALTY';
  defaultPoint: string | number;
  minPoint: string | number | null;
  maxPoint: string | number | null;
  isActive: boolean;
  sortOrder: number;
}

export interface StudentEnrollment {
  id: string;
  joinedAt: string;
  student: {
    id: string;
    studentCode: string;
    fullName: string;
    dateOfBirth?: string | null;
    gender?: string | null;
    phone?: string | null;
    address?: string | null;
  };
}

export interface Team {
  id: string;
  name: string;
  code: string;
  classroomId: string;
  memberships: Array<{
    id: string;
    joinedAt: string;
    isLeader: boolean;
    classStudent: {
      id: string;
      student: { id: string; studentCode: string; fullName: string };
    };
  }>;
  leaderHistory: Array<{
    id: string;
    startedAt: string;
    classStudent: { student: { id: string; studentCode: string; fullName: string } };
  }>;
}

export interface WeeklyRanking {
  rank: number;
  classStudentId: string;
  studentCode: string;
  fullName: string;
  bonusPoints: string | number;
  penaltyPoints: string | number;
  netScore: string | number;
  classification: string | null;
}

export interface StudentReport {
  classroom: { name: string; code: string };
  week: { id: string; name: string; startDate: string; endDate: string };
  results: WeeklyRanking[];
}

export interface TeamRanking {
  teamId: string;
  teamName: string;
  teamCode: string;
  memberCount: number;
  score: string | number;
  rank: number;
}

export interface PointRecord {
  id: string;
  classStudentId: string;
  criterionId: string;
  weekId: string;
  type: 'BONUS' | 'PENALTY';
  point: string | number;
  description: string | null;
  status: 'ACTIVE' | 'VOIDED';
  createdAt: string;
  criterion: { code: string; name: string };
  week: { name: string; startDate: string; endDate: string };
  classStudent: { student: { id: string; studentCode: string; fullName: string } };
  adjustments?: Array<{
    id: string;
    oldPoint: string | number;
    newPoint: string | number;
    reason: string;
    createdAt: string;
    adjustedBy: { id: string; fullName: string };
  }>;
}

export interface ClassificationRule {
  id: string;
  classroomId: string;
  name: string;
  minScore: string | number;
  maxScore: string | number | null;
  description: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  sortOrder: number;
}

export interface ClassroomImportPreview {
  teams: Array<{ code: string; name: string; studentCount: number }>;
  studentCount: number;
  newStudentCount: number;
  existingStudentCount: number;
  ambiguousTeamAssignmentCount: number;
  criteria: Array<{
    code: string;
    name: string;
    type: 'BONUS' | 'PENALTY';
    defaultPoint: number;
    sortOrder: number;
  }>;
  scoreHistoryImported: false;
}

export interface ClassroomImportResult {
  createdStudentCount: number;
  reactivatedStudentCount: number;
  createdTeamCount: number;
  createdCriterionCount: number;
  createdMembershipCount: number;
  credentials: Array<{
    studentCode: string;
    fullName: string;
    username: string;
    password: string;
  }>;
}

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace(/\/$/, '');
const ACCESS_TOKEN_KEY = 'class-point.access-token';
const REFRESH_TOKEN_KEY = 'class-point.refresh-token';
let refreshInFlight: Promise<string | null> | null = null;

export function getTokens() {
  return {
    accessToken: sessionStorage.getItem(ACCESS_TOKEN_KEY),
    refreshToken: sessionStorage.getItem(REFRESH_TOKEN_KEY),
  };
}

export function saveTokens(accessToken: string, refreshToken: string) {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}

async function rotateRefreshToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  const { refreshToken } = getTokens();
  if (!refreshToken) return null;

  refreshInFlight = fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (response) => {
      if (response.status === 401) {
        clearTokens();
        return null;
      }
      if (!response.ok) {
        throw new Error(`Không thể làm mới phiên đăng nhập (${response.status}).`);
      }
      const result = (await response.json()) as Pick<AuthResponse, 'accessToken' | 'refreshToken'>;
      saveTokens(result.accessToken, result.refreshToken);
      return result.accessToken;
    })
    .catch((reason: unknown) => {
      if (reason instanceof TypeError) {
        throw new Error('Không thể làm mới phiên đăng nhập. Hãy kiểm tra kết nối rồi thử lại.');
      }
      throw reason;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const { accessToken } = getTokens();
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    if (options.body instanceof FormData) {
      throw new Error(
        'Không thể gửi file Excel. Hãy chọn lại file và thử lại; nếu vẫn lỗi, hãy kiểm tra kết nối với API.',
      );
    }
    throw new Error(`Không thể kết nối máy chủ tại ${API_URL}. Hãy kiểm tra API đã chạy chưa.`);
  }

  if (
    response.status === 401 &&
    retry &&
    path !== '/auth/login' &&
    path !== '/auth/register' &&
    path !== '/auth/refresh'
  ) {
    const newAccessToken = await rotateRefreshToken();
    if (newAccessToken) return request<T>(path, options, false);
    throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { message?: string | string[] }
      | null;
    const message = Array.isArray(payload?.message)
      ? payload.message.join(', ')
      : payload?.message;
    throw new Error(message || `Yêu cầu thất bại (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return (await response.json()) as T;
  return (await response.blob()) as T;
}

function jsonBody(value: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(value) };
}

export const api = {
  login: (usernameOrEmail: string, password: string) =>
    request<AuthResponse>('/auth/login', jsonBody({ usernameOrEmail, password })),
  register: (username: string, email: string, fullName: string, password: string) =>
    request<AuthResponse>('/auth/register', jsonBody({ username, email, fullName, password })),
  me: () => request<AuthUser>('/auth/me'),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  classrooms: () => request<Classroom[]>('/classrooms'),
  academicYears: () => request<AcademicYear[]>('/academic-years'),
  createAcademicYear: (body: { name: string; startDate: string; endDate: string }) =>
    request<AcademicYear>('/academic-years', jsonBody(body)),
  createClassroom: (body: { name: string; code: string; academicYearId: string }) =>
    request<Classroom>('/classrooms', jsonBody(body)),
  updateClassroom: (classroomId: string, body: { rankingMode?: Classroom['rankingMode'] }) =>
    request<Pick<Classroom, 'id' | 'rankingMode'>>(`/classrooms/${classroomId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  previewClassroomImport: (classroomId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<ClassroomImportPreview>(`/classrooms/${classroomId}/imports/preview`, {
      method: 'POST',
      body: formData,
    });
  },
  importClassroomWorkbook: (classroomId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<ClassroomImportResult>(`/classrooms/${classroomId}/imports`, {
      method: 'POST',
      body: formData,
    });
  },
  weeks: (classroomId: string) =>
    request<CompetitionWeek[]>(`/classrooms/${classroomId}/weeks`),
  createWeek: (classroomId: string, body: { name: string; startDate: string; endDate: string }) =>
    request<CompetitionWeek>(`/classrooms/${classroomId}/weeks`, jsonBody(body)),
  closeWeek: (weekId: string, reopen = false) =>
    request<CompetitionWeek>(`/weeks/${weekId}/${reopen ? 'reopen' : 'close'}`, {
      method: 'POST',
    }),
  students: (classroomId: string) =>
    request<StudentEnrollment[]>(`/classrooms/${classroomId}/students`),
  createStudent: (classroomId: string, body: {
    username: string; email: string; password: string; studentCode: string; fullName: string;
  }) => request<StudentEnrollment>(`/classrooms/${classroomId}/students`, jsonBody(body)),
  updateStudent: (id: string, body: Partial<{ studentCode: string; fullName: string; phone: string; gender: string; address: string }>) =>
    request<void>(`/students/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  teams: (classroomId: string) => request<Team[]>(`/classrooms/${classroomId}/teams`),
  createTeam: (classroomId: string, body: { name: string; code: string }) =>
    request<Pick<Team, 'id' | 'name' | 'code' | 'classroomId'>>(`/classrooms/${classroomId}/teams`, jsonBody(body)),
  updateTeam: (id: string, body: { name: string; code: string }) =>
    request<void>(`/teams/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  addTeamMember: (teamId: string, classStudentId: string) =>
    request<void>(`/teams/${teamId}/members`, jsonBody({ classStudentId })),
  removeTeamMember: (teamId: string, memberId: string) =>
    request<void>(`/teams/${teamId}/members/${memberId}`, { method: 'DELETE' }),
  setTeamLeader: (teamId: string, classStudentId: string) =>
    request<void>(`/teams/${teamId}/leader`, { method: 'PATCH', body: JSON.stringify({ classStudentId }) }),
  classifications: (classroomId: string) =>
    request<ClassificationRule[]>(`/classrooms/${classroomId}/classifications`),
  createClassification: (classroomId: string, body: {
    name: string; minScore: number; maxScore?: number | null; description?: string;
  }) => request<ClassificationRule>(`/classrooms/${classroomId}/classifications`, jsonBody(body)),
  updateClassification: (id: string, body: Partial<{
    name: string; minScore: number; maxScore: number | null; description: string; status: 'ACTIVE' | 'INACTIVE';
  }>) => request<ClassificationRule>(`/classifications/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deactivateClassification: (id: string) =>
    request<void>(`/classifications/${id}`, { method: 'DELETE' }),
  criteria: (classroomId: string) =>
    request<Criterion[]>(`/classrooms/${classroomId}/criteria`),
  createCriterion: (
    classroomId: string,
    body: {
      code: string;
      name: string;
      type: 'BONUS' | 'PENALTY';
      defaultPoint: number;
      minPoint?: number;
      maxPoint?: number;
    },
  ) => request<Criterion>(`/classrooms/${classroomId}/criteria`, jsonBody(body)),
  deactivateCriterion: (criterionId: string) =>
    request<void>(`/criteria/${criterionId}`, { method: 'DELETE' }),
  updateCriterion: (id: string, body: Partial<{
    code: string; name: string; type: 'BONUS' | 'PENALTY'; defaultPoint: number; minPoint: number; maxPoint: number;
  }>) => request<void>(`/criteria/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  createPoint: (
    classroomId: string,
    body: {
      classStudentId: string;
      criterionId: string;
      weekId: string;
      description?: string;
    },
  ) => request<PointRecord>(`/classrooms/${classroomId}/points`, jsonBody(body)),
  adjustPoint: (pointRecordId: string, body: { newPoint: number; reason: string }) =>
    request<PointRecord>(`/points/${pointRecordId}/adjustments`, jsonBody(body)),
  voidPoint: (pointRecordId: string) =>
    request<void>(`/points/${pointRecordId}`, { method: 'DELETE' }),
  points: (classroomId: string, weekId: string) =>
    request<PointRecord[]>(`/classrooms/${classroomId}/points?weekId=${weekId}`),
  teamRankings: (classroomId: string, weekId: string) =>
    request<{ rankings: TeamRanking[] }>(
      `/classrooms/${classroomId}/weeks/${weekId}/rankings/teams`,
    ),
  studentReport: (classroomId: string, weekId: string) =>
    request<StudentReport>(
      `/classrooms/${classroomId}/reports/weeks/${weekId}/students`,
    ),
  exportReport: (classroomId: string, weekId: string) =>
    request<Blob>(
      `/classrooms/${classroomId}/reports/weeks/${weekId}/students/export`,
    ),
};
