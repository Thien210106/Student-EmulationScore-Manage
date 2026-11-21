import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Award,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Download,
  FileSpreadsheet,
  Flag,
  GraduationCap,
  History,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react';
import {
  api,
  clearTokens,
  getTokens,
  saveTokens,
  type AcademicYear,
  type AuthUser,
  type Classroom,
  type CompetitionWeek,
  type Criterion,
  type ClassroomImportPreview,
  type ClassroomImportResult,
  type ClassificationRule,
  type PointRecord,
  type StudentEnrollment,
  type StudentReport,
  type Team,
  type TeamRanking,
} from './api';

type View = 'overview' | 'students' | 'teams' | 'criteria' | 'weeks' | 'reports' | 'history' | 'classifications' | 'imports';
type Modal = 'point' | 'criterion' | 'week' | 'classroom' | null;
type LoadState = 'checking' | 'signed-out' | 'loading' | 'ready' | 'failed';

const navigation: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'students', label: 'Học sinh', icon: Users },
  { id: 'teams', label: 'Tổ thi đua', icon: Trophy },
  { id: 'criteria', label: 'Tiêu chí', icon: ClipboardList },
  { id: 'weeks', label: 'Tuần thi đua', icon: CalendarDays },
  { id: 'reports', label: 'Báo cáo', icon: BarChart3 },
  { id: 'history', label: 'Lịch sử điểm', icon: History },
  { id: 'classifications', label: 'Xếp loại', icon: Award },
  { id: 'imports', label: 'Nhập từ Excel', icon: FileSpreadsheet },
];

const money = (value: string | number | null | undefined) =>
  Number(value ?? 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });

const studentNameCollator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true });

const compareVietnameseNames = (nameA: string, nameB: string) => {
  const wordsA = nameA.trim().split(/\s+/).reverse();
  const wordsB = nameB.trim().split(/\s+/).reverse();
  const wordCount = Math.min(wordsA.length, wordsB.length);
  for (let index = 0; index < wordCount; index += 1) {
    const comparison = studentNameCollator.compare(wordsA[index], wordsB[index]);
    if (comparison !== 0) return comparison;
  }
  return wordsA.length - wordsB.length;
};

const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(new Date(value));

const isPastWeek = (endDate: string) =>
  endDate.slice(0, 10) < new Date().toISOString().slice(0, 10);

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0]?.toLocaleUpperCase('vi-VN') ?? '')
    .join('');

function App() {
  const [loadState, setLoadState] = useState<LoadState>('checking');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [classroomImport, setClassroomImport] = useState<{
    classroomId: string;
    result: ClassroomImportResult;
  } | null>(null);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [classroomId, setClassroomId] = useState('');
  const selectedClassroomRef = useRef('');
  const [weeks, setWeeks] = useState<CompetitionWeek[]>([]);
  const [weekId, setWeekId] = useState('');
  const [students, setStudents] = useState<StudentEnrollment[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [classifications, setClassifications] = useState<ClassificationRule[]>([]);
  const [points, setPoints] = useState<PointRecord[]>([]);
  const [studentReport, setStudentReport] = useState<StudentReport | null>(null);
  const [teamRankings, setTeamRankings] = useState<TeamRanking[]>([]);
  const [view, setView] = useState<View>('overview');
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const classroom = classrooms.find((item) => item.id === classroomId) ?? null;
  const week = weeks.find((item) => item.id === weekId) ?? null;
  const isTeacher = classroom?.role === 'HOMEROOM_TEACHER';

  const loadClassroomData = useCallback(
    async (selectedClassroomId: string, preferredWeekId?: string) => {
      const [nextWeeks, nextStudents, nextTeams, nextCriteria, nextClassifications] = await Promise.all([
        api.weeks(selectedClassroomId),
        api.students(selectedClassroomId),
        api.teams(selectedClassroomId),
        api.criteria(selectedClassroomId),
        api.classifications(selectedClassroomId),
      ]);
      setWeeks(nextWeeks);
      setStudents(nextStudents);
      setTeams(nextTeams);
      setCriteria(nextCriteria);
      setClassifications(nextClassifications);

      const today = new Date();
      const activeWeek = nextWeeks.find((item) => {
        const start = new Date(`${item.startDate.slice(0, 10)}T00:00:00`);
        const end = new Date(`${item.endDate.slice(0, 10)}T23:59:59`);
        return start <= today && today <= end;
      });
      const selectedWeek =
        nextWeeks.find((item) => item.id === preferredWeekId) ??
        activeWeek ??
        nextWeeks[0] ??
        null;
      setWeekId(selectedWeek?.id ?? '');

      if (!selectedWeek) {
        setPoints([]);
        setStudentReport(null);
        setTeamRankings([]);
        return;
      }

      const [nextPoints, nextReport, nextTeamRankings] = await Promise.all([
        api.points(selectedClassroomId, selectedWeek.id),
        api.studentReport(selectedClassroomId, selectedWeek.id),
        api.teamRankings(selectedClassroomId, selectedWeek.id),
      ]);
      setPoints(nextPoints);
      setStudentReport(nextReport);
      setTeamRankings(nextTeamRankings.rankings);
    },
    [],
  );

  const bootstrap = useCallback(async () => {
    setLoadState('loading');
    setError('');
    try {
      const [currentUser, currentClassrooms, currentYears] = await Promise.all([
        api.me(),
        api.classrooms(),
        api.academicYears(),
      ]);
      setUser(currentUser);
      setClassrooms(currentClassrooms);
      setAcademicYears(currentYears);
      const nextClassroom =
        currentClassrooms.find((item) => item.id === selectedClassroomRef.current) ?? currentClassrooms[0];
      setClassroomId(nextClassroom?.id ?? '');
      selectedClassroomRef.current = nextClassroom?.id ?? '';
      if (nextClassroom) {
        await loadClassroomData(nextClassroom.id);
      }
      setLoadState('ready');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tải dữ liệu.');
      setLoadState(getTokens().accessToken ? 'failed' : 'signed-out');
    }
  }, [loadClassroomData]);

  useEffect(() => {
    if (getTokens().accessToken) void bootstrap();
    else setLoadState('signed-out');
  }, [bootstrap]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const navigate = (event: Event) => {
      const target = (event as CustomEvent<View>).detail;
      if (navigation.some((item) => item.id === target)) setView(target);
    };
    window.addEventListener('classpoint:navigate', navigate);
    return () => window.removeEventListener('classpoint:navigate', navigate);
  }, []);

  const refreshClassroom = async (keepWeek = true) => {
    if (!classroomId) return;
    await loadClassroomData(classroomId, keepWeek ? weekId : undefined);
  };

  const openClassroomModal = async () => {
    setError('');
    try {
      const currentAcademicYears = await api.academicYears();
      setAcademicYears(currentAcademicYears);
      setModal('classroom');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tải danh sách năm học.');
    }
  };

  const handleAuth = async (
    usernameOrEmail: string,
    password: string,
    mode: 'login' | 'register',
    extra?: { email: string; fullName: string },
  ) => {
    setBusy(true);
    setError('');
    try {
      const result =
        mode === 'login'
          ? await api.login(usernameOrEmail, password)
          : await api.register(usernameOrEmail, extra?.email ?? '', extra?.fullName ?? '', password);
      saveTokens(result.accessToken, result.refreshToken);
      setUser(result.user);
      await bootstrap();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Đăng nhập không thành công.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    try {
      await api.logout();
    } catch {
      setToast('Đã đăng xuất khỏi thiết bị này.');
    } finally {
      clearTokens();
      setUser(null);
      setLoadState('signed-out');
    }
  };

  const handleClassroomChange = async (nextId: string) => {
    setClassroomId(nextId);
    selectedClassroomRef.current = nextId;
    setBusy(true);
    setError('');
    try {
      await loadClassroomData(nextId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tải lớp học.');
    } finally {
      setBusy(false);
    }
  };

  const handleWeekChange = async (nextId: string) => {
    setWeekId(nextId);
    if (!classroomId || !nextId) return;
    setBusy(true);
    setError('');
    try {
      const [nextPoints, nextReport, nextTeamRankings] = await Promise.all([
        api.points(classroomId, nextId),
        api.studentReport(classroomId, nextId),
        api.teamRankings(classroomId, nextId),
      ]);
      setPoints(nextPoints);
      setStudentReport(nextReport);
      setTeamRankings(nextTeamRankings.rankings);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tải báo cáo tuần.');
    } finally {
      setBusy(false);
    }
  };

  const showToast = (message: string) => {
    setToast(message);
    setError('');
  };

  if (loadState === 'checking' || loadState === 'loading') {
    return <LoadingScreen label={loadState === 'checking' ? 'Đang kiểm tra phiên đăng nhập' : 'Đang đồng bộ dữ liệu lớp học'} />;
  }
  if (loadState === 'signed-out') {
    return <AuthScreen onSubmit={handleAuth} busy={busy} error={error} />;
  }
  if (loadState === 'failed') {
    return (
      <div className="connection-screen">
        <div className="connection-card">
          <div className="brand-mark"><GraduationCap size={24} /></div>
          <span className="eyebrow">CLASS POINT</span>
          <h1>Chưa thể kết nối lớp học</h1>
          <p>{error}</p>
          <div className="connection-actions">
            <button className="button button-primary" onClick={() => void bootstrap()}>
              Thử kết nối lại <ArrowRight size={16} />
            </button>
            <button className="button button-quiet" onClick={() => void signOut()}>
              Đăng xuất
            </button>
          </div>
          <span className="helper-text">Kiểm tra API và kết nối cơ sở dữ liệu rồi thử lại.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {mobileMenuOpen && <button className="mobile-backdrop" onClick={() => setMobileMenuOpen(false)} aria-label="Đóng menu" />}
      <aside className={`sidebar ${mobileMenuOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><GraduationCap size={23} strokeWidth={2.2} /></div>
          <div><strong>class point</strong><span>CLASSROOM STUDIO</span></div>
          <button className="icon-button mobile-close" onClick={() => setMobileMenuOpen(false)} aria-label="Đóng menu"><X size={18} /></button>
        </div>

        <label className="side-label">LỚP ĐANG QUẢN LÝ</label>
        {classrooms.length ? (
          <div className="class-switcher">
            <span className="class-avatar">{classroom?.code?.slice(0, 2) ?? 'CP'}</span>
            <select
              aria-label="Chọn lớp học"
              value={classroomId}
              onChange={(event) => void handleClassroomChange(event.target.value)}
            >
              {classrooms.map((item) => (
                <option key={item.id} value={item.id}>{item.name} · {item.academicYear.name}</option>
              ))}
            </select>
            <ChevronDown size={15} />
          </div>
        ) : (
          <button className="class-empty" onClick={() => void openClassroomModal()}>
            <Plus size={16} /> Tạo lớp học đầu tiên
          </button>
        )}

        <label className="side-label nav-label">KHÔNG GIAN LỚP HỌC</label>
        <nav className="main-nav" aria-label="Điều hướng chính">
          {navigation.filter(({ id }) => id !== 'imports' || isTeacher).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${view === id ? 'nav-item-active' : ''}`}
              onClick={() => {
                setView(id);
                setMobileMenuOpen(false);
              }}
            >
              <Icon size={18} strokeWidth={1.9} />
              <span>{label}</span>
              {id === 'students' && students.length > 0 && <span className="nav-count">{students.length}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="tip-card">
            <div className="tip-icon"><Sparkles size={16} /></div>
            <strong>Mỗi điểm tốt đều đáng nhớ.</strong>
            <p>Ghi nhận nỗ lực nhỏ, tạo nên thay đổi lớn.</p>
            <span>CLASS POINT · 2026</span>
          </div>
          <button className="profile-button" onClick={() => void signOut()}>
            <Avatar name={user?.fullName ?? 'Tài khoản'} />
            <span className="profile-copy"><strong>{user?.fullName}</strong><small>{roleLabel(classroom?.role)}</small></span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu-button" onClick={() => setMobileMenuOpen(true)} aria-label="Mở menu"><Menu size={20} /></button>
          <div className="breadcrumb"><span>Lớp học</span><ChevronRight size={15} /><strong>{viewLabel(view)}</strong></div>
          <div className="topbar-actions">
            {weeks.length > 0 && (
              <label className="week-select">
                <CalendarDays size={16} />
                <select aria-label="Chọn tuần thi đua" value={weekId} onChange={(event) => void handleWeekChange(event.target.value)}>
                  {weeks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <ChevronDown size={14} />
              </label>
            )}
            {isTeacher && classroom && (
              <button className="button button-primary top-add-button" onClick={() => setModal('point')}>
                <Plus size={17} /> <span>Ghi nhận điểm</span>
              </button>
            )}
            <button className="icon-button help-button" aria-label="Trợ giúp"><CircleHelp size={18} /></button>
          </div>
        </header>

        <div className="content-area">
          {error && <div className="inline-error" role="alert"><ShieldCheck size={17} /><span>{error}</span><button onClick={() => setError('')} aria-label="Đóng thông báo"><X size={15} /></button></div>}
          {busy && <div className="sync-indicator"><LoaderCircle size={14} /> Đang cập nhật</div>}
          {!classroom ? (
            <NoClassroom onCreate={() => void openClassroomModal()} />
          ) : view === 'imports' && isTeacher ? (
            <ImportsView
              classroom={classroom}
              result={classroomImport?.classroomId === classroom.id ? classroomImport.result : null}
              onImported={async (result) => {
                setClassroomImport({ classroomId: classroom.id, result });
                await refreshClassroom();
                showToast('Đã đồng bộ danh sách học sinh, tổ và tiêu chí điểm.');
              }}
            />
          ) : !week && ['overview', 'reports', 'history'].includes(view) ? (
            <NoWeek isTeacher={isTeacher ?? false} onCreate={() => setModal('week')} onOpenWeeks={() => setView('weeks')} />
          ) : (
            <ViewContent
              view={view}
              user={user}
              classroom={classroom}
              week={week}
              weeks={weeks}
              students={students}
              teams={teams}
              criteria={criteria}
              classifications={classifications}
              points={points}
              studentReport={studentReport}
              teamRankings={teamRankings}
              isTeacher={isTeacher ?? false}
              onNewPoint={() => setModal('point')}
              onNewCriterion={() => setModal('criterion')}
              onNewWeek={() => setModal('week')}
              onCreateStudent={async (form) => {
                await api.createStudent(classroom.id, form);
                await refreshClassroom();
                showToast('Đã thêm học sinh vào lớp.');
              }}
              onUpdateStudent={async (id, form) => {
                await api.updateStudent(id, form);
                await refreshClassroom();
                showToast('Đã cập nhật hồ sơ học sinh.');
              }}
              onCreateTeam={async (form) => {
                await api.createTeam(classroom.id, form);
                await refreshClassroom();
                showToast('Đã tạo tổ thi đua.');
              }}
              onUpdateTeam={async (id, form) => {
                await api.updateTeam(id, form);
                await refreshClassroom();
                showToast('Đã cập nhật thông tin tổ.');
              }}
              onAddTeamMember={async (teamId, classStudentId) => {
                await api.addTeamMember(teamId, classStudentId);
                await refreshClassroom();
                showToast('Đã thêm thành viên vào tổ.');
              }}
              onRemoveTeamMember={async (teamId, memberId) => {
                await api.removeTeamMember(teamId, memberId);
                await refreshClassroom();
                showToast('Đã kết thúc thành viên tổ; lịch sử được giữ lại.');
              }}
              onSetTeamLeader={async (teamId, classStudentId) => {
                await api.setTeamLeader(teamId, classStudentId);
                await refreshClassroom();
                showToast('Đã cập nhật tổ trưởng.');
              }}
              onUpdateRankingMode={async (rankingMode) => {
                const updated = await api.updateClassroom(classroom.id, { rankingMode });
                setClassrooms((current) => current.map((item) => item.id === classroom.id ? { ...item, rankingMode: updated.rankingMode } : item));
                await refreshClassroom();
                showToast('Đã cập nhật cách xếp hạng tổ.');
              }}
              onCreateClassification={async (form) => {
                await api.createClassification(classroom.id, form);
                await refreshClassroom();
                showToast('Đã thêm quy tắc xếp loại.');
              }}
              onUpdateClassification={async (id, form) => {
                await api.updateClassification(id, form);
                await refreshClassroom();
                showToast('Đã cập nhật ngưỡng xếp loại.');
              }}
              onDeactivateClassification={async (id) => {
                await api.deactivateClassification(id);
                await refreshClassroom();
                showToast('Đã ngừng áp dụng quy tắc; lịch sử vẫn được giữ.');
              }}
              onDeactivateCriterion={async (id) => {
                await api.deactivateCriterion(id);
                await refreshClassroom();
                showToast('Đã ngừng tiêu chí; lịch sử điểm được giữ nguyên.');
              }}
              onUpdateCriterion={async (id, form) => {
                await api.updateCriterion(id, form);
                await refreshClassroom();
                showToast('Đã cập nhật tiêu chí.');
              }}
              onAdjustPoint={async (id, form) => {
                await api.adjustPoint(id, form);
                await refreshClassroom();
                showToast('Đã điều chỉnh điểm và lưu lý do vào lịch sử.');
              }}
              onVoidPoint={async (id) => {
                await api.voidPoint(id);
                await refreshClassroom();
                showToast('Đã hủy hiệu lực bản ghi điểm; lịch sử vẫn được giữ.');
              }}
              onWeekAction={async (id, reopen) => {
                setBusy(true);
                try {
                  await api.closeWeek(id, reopen);
                  await refreshClassroom();
                  showToast(reopen ? 'Đã mở lại tuần thi đua.' : 'Đã khóa tuần thi đua.');
                } catch (reason) {
                  setError(reason instanceof Error ? reason.message : 'Không thể cập nhật tuần.');
                } finally {
                  setBusy(false);
                }
              }}
              onExport={async () => {
                if (!week) return;
                setBusy(true);
                try {
                  const blob = await api.exportReport(classroom.id, week.id);
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `class-point-${week.name.replace(/\s+/g, '-').toLowerCase()}.xlsx`;
                  link.click();
                  URL.revokeObjectURL(url);
                  showToast('Báo cáo đã được tải xuống.');
                } catch (reason) {
                  setError(reason instanceof Error ? reason.message : 'Không thể xuất báo cáo.');
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}
        </div>
      </main>

      {toast && <div className="toast"><span className="toast-check"><Check size={14} /></span>{toast}</div>}
      {modal && (
        <ModalFrame onClose={() => setModal(null)}>
          {modal === 'point' && classroom && (
            <PointModal
              students={students}
              teams={teams}
              criteria={criteria.filter((item) => item.isActive)}
              weeks={weeks.filter((item) => !item.isClosed && !isPastWeek(item.endDate))}
              onClose={() => setModal(null)}
              onSubmit={async (form) => {
                await api.createPoint(classroom.id, form);
                await refreshClassroom();
                setModal(null);
                showToast('Điểm thi đua đã được ghi nhận.');
              }}
            />
          )}
          {modal === 'criterion' && classroom && (
            <CriterionModal
              classroomId={classroom.id}
              onClose={() => setModal(null)}
              onSubmit={async (form) => {
                await api.createCriterion(classroom.id, form);
                await refreshClassroom();
                setModal(null);
                showToast('Đã thêm tiêu chí mới.');
              }}
            />
          )}
          {modal === 'week' && classroom && (
            <WeekModal
              classroomId={classroom.id}
              onClose={() => setModal(null)}
              onSubmit={async (form) => {
                await api.createWeek(classroom.id, form);
                await refreshClassroom(false);
                setModal(null);
                showToast('Tuần thi đua đã được tạo.');
              }}
            />
          )}
          {modal === 'classroom' && (
            <ClassroomModal
              academicYears={academicYears}
              onClose={() => setModal(null)}
              onCreateAcademicYear={async (form) => {
                const created = await api.createAcademicYear(form);
                setAcademicYears((current) => [...current, created]);
                return created;
              }}
              onSubmit={async (form) => {
                const created = await api.createClassroom(form);
                setModal(null);
                setClassrooms((current) => [...current, created]);
                setClassroomId(created.id);
                selectedClassroomRef.current = created.id;
                await loadClassroomData(created.id);
                showToast('Lớp học mới đã sẵn sàng.');
              }}
            />
          )}
        </ModalFrame>
      )}
    </div>
  );
}

function ViewContent(props: {
  view: View;
  user: AuthUser | null;
  classroom: Classroom;
  week: CompetitionWeek | null;
  weeks: CompetitionWeek[];
  students: StudentEnrollment[];
  teams: Team[];
  criteria: Criterion[];
  classifications: ClassificationRule[];
  points: PointRecord[];
  studentReport: StudentReport | null;
  teamRankings: TeamRanking[];
  isTeacher: boolean;
  onNewPoint: () => void;
  onNewCriterion: () => void;
  onNewWeek: () => void;
  onWeekAction: (id: string, reopen: boolean) => Promise<void>;
  onExport: () => Promise<void>;
  onCreateStudent: (form: { username: string; email: string; password: string; studentCode: string; fullName: string }) => Promise<void>;
  onUpdateStudent: (id: string, form: { studentCode: string; fullName: string }) => Promise<void>;
  onCreateTeam: (form: { name: string; code: string }) => Promise<void>;
  onUpdateTeam: (id: string, form: { name: string; code: string }) => Promise<void>;
  onAddTeamMember: (teamId: string, classStudentId: string) => Promise<void>;
  onRemoveTeamMember: (teamId: string, memberId: string) => Promise<void>;
  onSetTeamLeader: (teamId: string, classStudentId: string) => Promise<void>;
  onUpdateRankingMode: (mode: Classroom['rankingMode']) => Promise<void>;
  onCreateClassification: (form: { name: string; minScore: number; maxScore?: number | null; description?: string }) => Promise<void>;
  onUpdateClassification: (id: string, form: Partial<{ name: string; minScore: number; maxScore: number | null; description: string }>) => Promise<void>;
  onDeactivateClassification: (id: string) => Promise<void>;
  onDeactivateCriterion: (id: string) => Promise<void>;
  onUpdateCriterion: (id: string, form: Partial<{ name: string; defaultPoint: number; minPoint: number; maxPoint: number }>) => Promise<void>;
  onAdjustPoint: (id: string, form: { newPoint: number; reason: string }) => Promise<void>;
  onVoidPoint: (id: string) => Promise<void>;
}) {
  switch (props.view) {
    case 'students':
      return <StudentsView {...props} />;
    case 'teams':
      return <TeamsView {...props} />;
    case 'criteria':
      return <CriteriaView {...props} />;
    case 'weeks':
      return <WeeksView {...props} />;
    case 'reports':
      return <ReportsView {...props} />;
    case 'classifications':
      return <ClassificationsView {...props} />;
    case 'history':
      return <PointsHistoryView {...props} />;
    default:
      return <OverviewView {...props} />;
  }
}

function ImportsView({
  classroom,
  result,
  onImported,
}: {
  classroom: Classroom;
  result: ClassroomImportResult | null;
  onImported: (result: ClassroomImportResult) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ClassroomImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileSelectionId = useRef(0);

  const selectFile = async (selected: File | null) => {
    const selectionId = ++fileSelectionId.current;
    setFile(null);
    setPreview(null);
    setError('');
    if (!selected) return;
    try {
      const contents = await selected.arrayBuffer();
      if (selectionId === fileSelectionId.current) {
        setFile(new File([contents], selected.name, {
          type: selected.type,
          lastModified: selected.lastModified,
        }));
      }
    } catch {
      if (selectionId === fileSelectionId.current) {
        setError('Không đọc được file Excel đã chọn. Hãy chọn lại file từ thiết bị.');
      }
    }
  };

  const createPreview = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      setPreview(await api.previewClassroomImport(classroom.id, file));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể đọc file Excel.');
    } finally {
      setBusy(false);
    }
  };

  const importFile = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const imported = await api.importClassroomWorkbook(classroom.id, file);
      setPreview(null);
      await onImported(imported);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể nhập dữ liệu từ Excel.');
    } finally {
      setBusy(false);
    }
  };

  const downloadCredentials = () => {
    if (!result?.credentials.length) return;
    const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csv = [
      ['Mã học sinh', 'Họ và tên', 'Tên đăng nhập', 'Mật khẩu tạm'],
      ...result.credentials.map(({ studentCode, fullName, username, password }) => [
        studentCode,
        fullName,
        username,
        password,
      ]),
    ]
      .map((row) => row.map(escapeCell).join(','))
      .join('\r\n');
    const link = document.createElement('a');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    link.href = url;
    const safeClassCode = classroom.code.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'class';
    link.download = `${safeClassCode}-tai-khoan-hoc-sinh.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <PageIntro
        eyebrow="ĐỒNG BỘ DỮ LIỆU LỚP"
        title="Nhập danh sách từ Excel"
        description={`Tải bảng theo dõi thi đua của ${classroom.name} để đồng bộ học sinh, tổ và tiêu chí cộng/trừ điểm.`}
      />
      <section className="import-layout">
        <div className="panel import-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">FILE NGUỒN</span>
              <h2>Chọn bảng theo dõi thi đua</h2>
            </div>
            <span className="import-file-icon"><FileSpreadsheet size={20} /></span>
          </div>
          <label className="import-dropzone" htmlFor="classroom-workbook">
            <span className="import-upload-icon"><Download size={20} /></span>
            <strong>{file?.name ?? 'Chọn file Excel (.xlsx)'}</strong>
            <span>{file ? `${(file.size / 1024).toFixed(0)} KB · tối đa 10 MB` : 'Hỗ trợ workbook có nhiều sheet theo từng tổ'}</span>
            <input
              id="classroom-workbook"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <div className="import-actions">
            <button className="button button-outline" disabled={!file || busy} onClick={() => void createPreview()}>
              {busy && !preview ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}
              Kiểm tra file
            </button>
            {preview && (
              <button className="button button-primary" disabled={busy} onClick={() => void importFile()}>
                {busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
                Xác nhận đồng bộ
              </button>
            )}
          </div>
          {error && <div className="form-error" role="alert"><ShieldCheck size={16} />{error}</div>}
          {preview && (
            <div className="import-preview" aria-live="polite">
              <div className="import-summary">
                <span><strong>{preview.studentCount}</strong> học sinh · <strong>{preview.teams.length}</strong> tổ</span>
                <span><strong>{preview.criteria.length}</strong> tiêu chí cộng/trừ</span>
                <span><strong>{preview.newStudentCount}</strong> học sinh mới · {preview.existingStudentCount} đã có</span>
              </div>
              {preview.ambiguousTeamAssignmentCount > 0 && (
                <div className="import-warning" role="status">
                  <CircleHelp size={16} />
                  <span>Có {preview.ambiguousTeamAssignmentCount} học sinh xuất hiện ở nhiều sheet. Để mỗi em chỉ thuộc một tổ, hệ thống xếp các em vào tổ đầu tiên có tên trong workbook; số lượng từng tổ đã phản ánh cách xếp này.</span>
                </div>
              )}
              <div className="import-team-list">
                {preview.teams.map((team) => (
                  <span className="import-team-chip" key={team.code}>{team.name}<small>{team.studentCount} HS</small></span>
                ))}
              </div>
              <div className="table-scroll import-criteria-table">
                <table className="data-table">
                  <thead><tr><th>TIÊU CHÍ</th><th>LOẠI</th><th className="align-right">ĐIỂM MẶC ĐỊNH</th></tr></thead>
                  <tbody>{preview.criteria.map((criterion) => (
                    <tr key={criterion.code}>
                      <td>{criterion.name}</td>
                      <td className={criterion.type === 'BONUS' ? 'positive' : 'negative'}>{criterion.type === 'BONUS' ? 'Cộng' : 'Trừ'}</td>
                      <td className="align-right">{criterion.type === 'BONUS' ? '+' : '−'}{money(criterion.defaultPoint)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <p className="import-note">Chỉ đồng bộ danh sách học sinh, tên các tổ và tiêu chí. Các số điểm lịch sử trong bảng không được nhập.</p>
            </div>
          )}
          {result && (
            <div className="import-success" role="status">
              <strong>Đồng bộ hoàn tất</strong>
              <span>{result.createdStudentCount} học sinh mới, {result.reactivatedStudentCount} học sinh được kích hoạt lại, {result.createdTeamCount} tổ mới và {result.createdCriterionCount} tiêu chí mới.</span>
              {result.credentials.length > 0 && (
                <div className="credential-notice">
                  <span>Đã tạo tài khoản học sinh. Có thể tải lại thông tin đăng nhập trong phiên này; hãy lưu file ở nơi an toàn.</span>
                  <button type="button" className="button button-outline" onClick={downloadCredentials}><Download size={15} /> Tải thông tin đăng nhập</button>
                </div>
              )}
            </div>
          )}
        </div>
        <aside className="panel import-guide">
          <span className="eyebrow">TRƯỚC KHI ĐỒNG BỘ</span>
          <h2>Cách hoạt động</h2>
          <ul>
            <li><Check size={15} /> Mỗi sheet có tên tổ; học sinh được lấy từ hai cột họ tên.</li>
            <li><Check size={15} /> Tiêu chí có dạng tên kèm điểm trong ngoặc, ví dụ “Phát biểu (+2)”.</li>
            <li><Check size={15} /> Học sinh được ghép theo họ tên chính xác; dữ liệu đã có sẽ không bị ghi đè.</li>
            <li><ShieldCheck size={15} /> Điểm lịch sử không nhập và không thay đổi.</li>
          </ul>
          <p>Chỉ file .xlsx, tối đa 10 MB. Hãy xem trước dữ liệu trước khi xác nhận.</p>
        </aside>
      </section>
    </>
  );
}

function OverviewView({
  user,
  classroom,
  week,
  students,
  teams,
  criteria,
  points,
  studentReport,
  teamRankings,
  isTeacher,
  onNewPoint,
  onExport,
  onAdjustPoint,
  onVoidPoint,
}: Parameters<typeof ViewContent>[0]) {
  const activePoints = points.filter((item) => item.status === 'ACTIVE');
  const bonusPoints = activePoints.filter((item) => item.type === 'BONUS').reduce((sum, item) => sum + Number(item.point), 0);
  const penaltyPoints = activePoints.filter((item) => item.type === 'PENALTY').reduce((sum, item) => sum + Number(item.point), 0);
  const topTeam = [...teamRankings].sort((a, b) => Number(b.score) - Number(a.score))[0];
  const firstName = user?.fullName.trim().split(/\s+/).slice(-1)[0] ?? 'bạn';

  return (
    <>
      <section className="welcome-row">
        <div>
          <div className="eyebrow"><span className="live-dot" /> KHÔNG GIAN THI ĐUA CỦA BẠN</div>
          <h1>Chào {firstName}, <span>mình cùng bắt đầu nhé!</span></h1>
          <p className="page-description">{classroom.name} · {classroom.academicYear.name} <span className="dot-separator">•</span> {week ? `${week.name}, ${dateLabel(week.startDate)} — ${dateLabel(week.endDate)}` : 'Chưa có tuần thi đua'}</p>
        </div>
        <button className="button button-outline report-shortcut" onClick={() => void onExport()} disabled={!week}>
          <FileSpreadsheet size={16} /> Xuất báo cáo
        </button>
      </section>

      <section className="metric-grid" aria-label="Thống kê thi đua tuần">
        <MetricCard
          label="Học sinh trong lớp"
          value={students.length.toLocaleString('vi-VN')}
          note={classroom.code}
          icon={<Users size={19} />}
          tint="sage"
          trend="Tổng thành viên"
        />
        <MetricCard
          label="Điểm thưởng tuần này"
          value={`+${money(bonusPoints)}`}
          note="điểm"
          icon={<Zap size={19} />}
          tint="yellow"
          trend={`${activePoints.filter((item) => item.type === 'BONUS').length} lượt ghi nhận`}
        />
        <MetricCard
          label="Điểm cần cải thiện"
          value={`−${money(penaltyPoints)}`}
          note="điểm"
          icon={<ArrowDownRight size={19} />}
          tint="rose"
          trend={`${activePoints.filter((item) => item.type === 'PENALTY').length} lượt ghi nhận`}
        />
        <MetricCard
          label="Tổ đang thi đua"
          value={teams.length.toLocaleString('vi-VN')}
          note="tổ"
          icon={<Trophy size={19} />}
          tint="blue"
          trend={topTeam ? `Dẫn đầu · ${topTeam.teamName}` : `${criteria.length} tiêu chí hoạt động`}
        />
      </section>

      <section className="dashboard-grid">
        <article className="panel leaderboard-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">BẢNG VÀNG</span>
              <h2>Xếp hạng cá nhân <span className="heading-week">{week?.name}</span></h2>
            </div>
            <span className="panel-icon panel-icon-gold"><Award size={19} /></span>
          </div>
          {studentReport?.results.length ? (
            <div className="ranking-list">
              {studentReport.results.slice(0, 5).map((item, index) => (
                <div className={`ranking-row ${index === 0 ? 'ranking-row-first' : ''}`} key={item.classStudentId}>
                  <RankBadge rank={item.rank} />
                  <Avatar name={item.fullName} size="small" />
                  <div className="ranking-person"><strong>{item.fullName}</strong><span>{item.studentCode}{item.classification ? ` · ${item.classification}` : ''}</span></div>
                  <strong className="ranking-score">{money(item.netScore)}<small>đ</small></strong>
                  {index === 0 && <span className="crown-mark" aria-label="Hạng nhất">✦</span>}
                </div>
              ))}
            </div>
          ) : <EmptyInline title="Chưa có dữ liệu xếp hạng" description="Điểm sẽ xuất hiện khi lớp bắt đầu ghi nhận thi đua." />}
          <div className="panel-footer">
            <span>{studentReport?.results.length ?? 0} học sinh được xếp hạng</span>
            <button className="text-button" onClick={() => window.dispatchEvent(new CustomEvent('classpoint:navigate', { detail: 'reports' }))}>Xem báo cáo <ArrowRight size={14} /></button>
          </div>
        </article>

        <article className="panel team-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">CÙNG NHAU TIẾN BỘ</span>
              <h2>Thi đua tổ nhóm</h2>
            </div>
            <span className="panel-icon panel-icon-green"><Trophy size={18} /></span>
          </div>
          {teamRankings.length ? (
            <div className="team-ranking-list">
              {teamRankings.slice(0, 4).map((team, index) => (
                <div className="team-ranking-row" key={team.teamId}>
                  <RankBadge rank={team.rank} />
                  <div className={`team-symbol team-symbol-${index % 4}`}>{team.teamCode.slice(0, 1)}</div>
                  <div className="ranking-person"><strong>{team.teamName}</strong><span>{team.memberCount} thành viên</span></div>
                  <strong className="ranking-score">{money(team.score)}<small>đ</small></strong>
                </div>
              ))}
            </div>
          ) : <EmptyInline title="Chưa có tổ thi đua" description="Các tổ sẽ xuất hiện tại đây sau khi được tạo." />}
          <div className="panel-footer">
            <span>{classroom.rankingMode === 'AVERAGE_SCORE' ? 'Điểm trung bình / thành viên' : 'Tổng điểm thi đua'}</span>
            <button className="text-button" onClick={() => window.dispatchEvent(new CustomEvent('classpoint:navigate', { detail: 'teams' }))}>Chi tiết <ArrowRight size={14} /></button>
          </div>
        </article>
      </section>

      <section className="panel activity-panel">
        <div className="panel-heading activity-heading">
          <div>
            <span className="eyebrow">CẬP NHẬT GẦN ĐÂY</span>
            <h2>Dấu ấn tuần này</h2>
          </div>
          {isTeacher && <button className="button button-soft" onClick={onNewPoint}><Plus size={16} /> Ghi nhận điểm</button>}
        </div>
        {activePoints.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>HỌC SINH</th><th>TIÊU CHÍ</th><th>THỜI GIAN</th><th>GHI CHÚ</th><th className="align-right">ĐIỂM</th>{isTeacher && week && !week.isClosed && !isPastWeek(week.endDate) && <th>THAO TÁC</th>}</tr></thead>
              <tbody>
                {activePoints.slice(0, 6).map((point) => (
                  <tr key={point.id}>
                    <td><div className="table-person"><Avatar name={point.classStudent.student.fullName} size="tiny" /><span><strong>{point.classStudent.student.fullName}</strong><small>{point.classStudent.student.studentCode}</small></span></div></td>
                    <td><span className={`criterion-pill ${point.type === 'BONUS' ? 'pill-bonus' : 'pill-penalty'}`}>{point.criterion.name}</span></td>
                    <td className="muted-cell">{new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: 'short' }).format(new Date(point.createdAt))}</td>
                    <td className="muted-cell description-cell">{point.description || '—'}</td>
                    <td className={`align-right point-value ${point.type === 'BONUS' ? 'positive' : 'negative'}`}>{point.type === 'BONUS' ? '+' : '−'}{money(point.point)}</td>
                    {isTeacher && week && !week.isClosed && !isPastWeek(week.endDate) && <td><PointRecordActions point={point} onAdjust={onAdjustPoint} onVoid={onVoidPoint} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="activity-empty">
            <div className="empty-illustration"><ClipboardList size={23} /></div>
            <div><strong>Tuần mới, khởi đầu mới</strong><p>Chưa có hoạt động nào. Hãy ghi nhận nỗ lực đầu tiên của lớp mình.</p></div>
            {isTeacher && <button className="button button-primary" onClick={onNewPoint}><Plus size={16} /> Nhập điểm đầu tiên</button>}
          </div>
        )}
        <div className="activity-footnote"><ShieldCheck size={14} /> Mọi điều chỉnh điểm đều được lưu lại trong lịch sử.</div>
      </section>

      <footer className="page-footnote"><span>CLASS POINT <i /> Mỗi nỗ lực đều có giá trị.</span><span>{classroom.academicYear.name}</span></footer>
    </>
  );
}

function StudentsView(props: Parameters<typeof ViewContent>[0]) {
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const [studentForm, setStudentForm] = useState({ username: '', email: '', password: '', studentCode: '', fullName: '' });
  const [editingStudentId, setEditingStudentId] = useState('');
  const [editStudent, setEditStudent] = useState({ studentCode: '', fullName: '' });
  const visible = props.students
    .filter(({ student }) =>
      `${student.fullName} ${student.studentCode}`.toLocaleLowerCase('vi-VN').includes(query.toLocaleLowerCase('vi-VN')),
    )
    .sort((a, b) =>
      compareVietnameseNames(a.student.fullName, b.student.fullName) ||
      studentNameCollator.compare(a.student.studentCode, b.student.studentCode),
    );
  return (
    <>
      <PageIntro eyebrow="THÀNH VIÊN LỚP HỌC" title="Học sinh" description={`${props.students.length} học sinh đang tham gia ${props.classroom.name}.`} action={props.isTeacher ? <button className="button button-primary" onClick={() => { setCreateError(''); setShowCreate((value) => !value); }}><Plus size={16} /> Thêm học sinh</button> : undefined} />
      {showCreate && props.isTeacher && <form className="panel content-panel management-form" onSubmit={async (event) => { event.preventDefault(); setSaving(true); setCreateError(''); try { await props.onCreateStudent(studentForm); setStudentForm({ username: '', email: '', password: '', studentCode: '', fullName: '' }); setShowCreate(false); } catch (reason) { setCreateError(reason instanceof Error ? reason.message : 'Không thể thêm học sinh.'); } finally { setSaving(false); } }}>
        <div className="panel-heading"><div><span className="eyebrow">TẠO HỒ SƠ VÀ TÀI KHOẢN</span><h2>Thêm học sinh vào lớp</h2></div></div>
        <div className="management-grid"><label className="form-field">Họ và tên<input required maxLength={150} value={studentForm.fullName} onChange={(event) => setStudentForm({ ...studentForm, fullName: event.target.value })} /></label><label className="form-field">Mã học sinh<input required maxLength={40} value={studentForm.studentCode} onChange={(event) => setStudentForm({ ...studentForm, studentCode: event.target.value })} /></label><label className="form-field">Tên đăng nhập<input required minLength={3} maxLength={50} pattern="[A-Za-z0-9._-]+" value={studentForm.username} onChange={(event) => setStudentForm({ ...studentForm, username: event.target.value })} /></label><label className="form-field">Email<input required type="email" maxLength={254} value={studentForm.email} onChange={(event) => setStudentForm({ ...studentForm, email: event.target.value })} /></label><label className="form-field">Mật khẩu tạm<input required type="password" minLength={12} maxLength={72} autoComplete="new-password" value={studentForm.password} onChange={(event) => setStudentForm({ ...studentForm, password: event.target.value })} /><span className="field-note">Ít nhất 12 ký tự; gửi riêng cho học sinh.</span></label></div>
        {createError && <div className="form-error" role="alert">{createError}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setShowCreate(false)}>Hủy</button><button className="button button-primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} Tạo học sinh</button></div>
      </form>}
      <section className="panel content-panel">
        <div className="toolbar">
          <div className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tên hoặc mã học sinh" /></div>
          <span className="result-count">{visible.length} kết quả</span>
        </div>
        {visible.length ? (
          <div className="table-scroll"><table className="data-table">
            <thead><tr><th>HỌC SINH</th><th>MÃ HỌC SINH</th><th>THAM GIA TỪ</th><th>ĐIỂM TUẦN</th><th>XẾP LOẠI</th>{props.isTeacher && <th />}</tr></thead>
            <tbody>{visible.flatMap((row) => {
              const score = props.studentReport?.results.find((item) => item.classStudentId === row.id);
              const rows = [<tr key={row.id}>
                <td><div className="table-person"><Avatar name={row.student.fullName} /><span><strong>{row.student.fullName}</strong><small>{row.student.gender || 'Học sinh'}</small></span></div></td>
                <td><span className="code-chip">{row.student.studentCode}</span></td>
                <td className="muted-cell">{dateLabel(row.joinedAt)}</td>
                <td className="point-value">{money(score?.netScore ?? 0)} điểm</td>
                <td>{score?.classification ? <span className="status-pill status-green">{score.classification}</span> : <span className="muted-cell">Chưa xếp loại</span>}</td>
                {props.isTeacher && <td><button className="text-button" onClick={() => { setEditingStudentId(editingStudentId === row.id ? '' : row.id); setEditStudent({ studentCode: row.student.studentCode, fullName: row.student.fullName }); }}>{editingStudentId === row.id ? 'Đóng' : 'Sửa hồ sơ'}</button></td>}
              </tr>];
              if (editingStudentId === row.id) rows.push(<tr key={`${row.id}-edit`}><td colSpan={6}><form className="inline-edit-form" onSubmit={async (event) => { event.preventDefault(); try { await props.onUpdateStudent(row.student.id, editStudent); setEditingStudentId(''); setCreateError(''); } catch (reason) { setCreateError(reason instanceof Error ? reason.message : 'Không thể cập nhật học sinh.'); } }}><input aria-label="Họ và tên" required maxLength={150} value={editStudent.fullName} onChange={(event) => setEditStudent({ ...editStudent, fullName: event.target.value })} /><input aria-label="Mã học sinh" required maxLength={40} value={editStudent.studentCode} onChange={(event) => setEditStudent({ ...editStudent, studentCode: event.target.value })} /><button className="button button-primary">Lưu</button>{createError && <span className="form-error">{createError}</span>}</form></td></tr>);
              return rows;
            })}</tbody>
          </table></div>
        ) : <EmptyState icon={<Users size={22} />} title="Không tìm thấy học sinh" description="Thử một từ khóa khác để tìm thành viên lớp." />}
      </section>
    </>
  );
}

function TeamsView(props: Parameters<typeof ViewContent>[0]) {
  const sorted = props.teams.map((team) => props.teamRankings.find((ranking) => ranking.teamId === team.id) ?? ({
    teamId: team.id,
    teamName: team.name,
    teamCode: team.code,
    memberCount: team.memberships.length,
    score: 0,
    rank: 0,
  })).sort((a, b) => (a.rank || Number.MAX_SAFE_INTEGER) - (b.rank || Number.MAX_SAFE_INTEGER) || a.teamName.localeCompare(b.teamName, 'vi'));
  const teamById = new Map(props.teams.map((team) => [team.id, team]));
  const [showCreate, setShowCreate] = useState(false);
  const [teamForm, setTeamForm] = useState({ name: '', code: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [memberChoice, setMemberChoice] = useState<Record<string, string>>({});
  const [leaderChoice, setLeaderChoice] = useState<Record<string, string>>({});
  const [teamEdit, setTeamEdit] = useState<Record<string, { name: string; code: string }>>({});
  return (
    <>
      <PageIntro eyebrow="SỨC MẠNH TẬP THỂ" title="Tổ thi đua" description="Mỗi thành viên góp một chút, cả tổ cùng tiến xa." action={<div className="team-header-actions">{props.isTeacher && <label className="ranking-mode-select">Xếp hạng<select value={props.classroom.rankingMode} onChange={async (event) => { setSaving(true); setError(''); try { await props.onUpdateRankingMode(event.target.value as Classroom['rankingMode']); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể đổi phương pháp xếp hạng.'); } finally { setSaving(false); } }} disabled={saving}><option value="TOTAL_SCORE">Tổng điểm</option><option value="AVERAGE_SCORE">Điểm trung bình</option></select></label>}{props.isTeacher && <button className="button button-primary" onClick={() => setShowCreate((value) => !value)}><Plus size={16} /> Tạo tổ</button>}</div>} />
      {error && <div className="inline-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Đóng thông báo"><X size={15} /></button></div>}
      {showCreate && props.isTeacher && <form className="panel content-panel management-form" onSubmit={async (event) => { event.preventDefault(); setSaving(true); setError(''); try { await props.onCreateTeam({ name: teamForm.name.trim(), code: teamForm.code.trim().toUpperCase() }); setTeamForm({ name: '', code: '' }); setShowCreate(false); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể tạo tổ.'); } finally { setSaving(false); } }}><div className="management-grid"><label className="form-field">Tên tổ<input required maxLength={100} value={teamForm.name} onChange={(event) => setTeamForm({ ...teamForm, name: event.target.value })} /></label><label className="form-field">Mã tổ<input required maxLength={30} value={teamForm.code} onChange={(event) => setTeamForm({ ...teamForm, code: event.target.value.toUpperCase() })} /></label></div>{error && <div className="form-error" role="alert">{error}</div>}<div className="modal-actions"><button className="button button-primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} Lưu tổ</button></div></form>}
      {sorted.length ? <div className="team-card-grid">
        {sorted.map((rank) => {
          const team = teamById.get(rank.teamId);
          return <article className={`team-card ${rank.rank === 1 ? 'team-card-leader' : ''}`} key={rank.teamId}>
            <div className="team-card-top"><div className={`team-symbol team-symbol-${Math.max(0, rank.rank - 1) % 4}`}>{rank.teamCode.slice(0, 1)}</div><span className="rank-tag">{rank.rank ? `#${rank.rank}` : '—'}</span><span className="team-menu-spacer" /></div>
            <h2>{rank.teamName}</h2><p>{rank.teamCode} <i /> {rank.memberCount} thành viên</p>
            <div className="team-score-block"><span>ĐIỂM THI ĐUA</span><strong>{money(rank.score)}<small>đ</small></strong></div>
            <div className="member-stack">
              {(team?.memberships ?? []).slice(0, 5).map((member) => <span className="stack-avatar" title={member.classStudent.student.fullName} key={member.id}>{initials(member.classStudent.student.fullName)}</span>)}
              {rank.memberCount > 5 && <span className="stack-more">+{rank.memberCount - 5}</span>}
            </div>
            {team?.leaderHistory[0] && <div className="team-leader-caption"><Flag size={14} /> Tổ trưởng: {team.leaderHistory[0].classStudent.student.fullName}</div>}
            {props.isTeacher && team && <details className="team-manage"><summary>Quản lý thành viên</summary><div className="team-manage-content">
              <form className="inline-edit-form" onSubmit={async (event) => { event.preventDefault(); setError(''); try { await props.onUpdateTeam(team.id, { name: (teamEdit[team.id]?.name ?? team.name).trim(), code: (teamEdit[team.id]?.code ?? team.code).trim().toUpperCase() }); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể cập nhật tổ.'); } }}><input aria-label="Tên tổ" required maxLength={100} value={teamEdit[team.id]?.name ?? team.name} onChange={(event) => setTeamEdit({ ...teamEdit, [team.id]: { name: event.target.value, code: teamEdit[team.id]?.code ?? team.code } })} /><input aria-label="Mã tổ" required maxLength={30} value={teamEdit[team.id]?.code ?? team.code} onChange={(event) => setTeamEdit({ ...teamEdit, [team.id]: { name: teamEdit[team.id]?.name ?? team.name, code: event.target.value.toUpperCase() } })} /><button className="button button-outline">Lưu tên tổ</button></form>
              <label className="form-field">Thêm học sinh<select value={memberChoice[team.id] ?? ''} onChange={(event) => setMemberChoice({ ...memberChoice, [team.id]: event.target.value })}><option value="">Chọn học sinh chưa thuộc tổ</option>{props.students.filter((student) => !props.teams.some((candidate) => candidate.memberships.some((membership) => membership.classStudent.id === student.id))).map((student) => <option key={student.id} value={student.id}>{student.student.fullName} · {student.student.studentCode}</option>)}</select></label>
              <button className="button button-soft" disabled={!memberChoice[team.id]} onClick={async () => { try { await props.onAddTeamMember(team.id, memberChoice[team.id]); setMemberChoice({ ...memberChoice, [team.id]: '' }); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể thêm thành viên.'); } }}>Thêm vào tổ</button>
              <label className="form-field">Tổ trưởng<select value={leaderChoice[team.id] ?? team.memberships.find((member) => member.isLeader)?.classStudent.id ?? ''} onChange={(event) => setLeaderChoice({ ...leaderChoice, [team.id]: event.target.value })}><option value="">Chưa phân công</option>{team.memberships.map((member) => <option key={member.id} value={member.classStudent.id}>{member.classStudent.student.fullName}</option>)}</select></label>
              <button className="button button-outline" disabled={!leaderChoice[team.id]} onClick={async () => { try { await props.onSetTeamLeader(team.id, leaderChoice[team.id]); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể đổi tổ trưởng.'); } }}>Lưu tổ trưởng</button>
              <div className="team-member-manage-list">{team.memberships.map((member) => <div key={member.id}><span>{member.classStudent.student.fullName}{member.isLeader ? ' · Tổ trưởng' : ''}</span><button className="text-button" onClick={async () => { try { await props.onRemoveTeamMember(team.id, member.id); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể gỡ thành viên.'); } }}>Chuyển tổ</button></div>)}</div>
            </div></details>}
          </article>;
        })}
      </div> : <EmptyState icon={<Trophy size={22} />} title="Chưa có tổ thi đua" description="Khi giáo viên tạo tổ và phân công thành viên, bảng xếp hạng sẽ hiện ở đây." />}
    </>
  );
}

function ClassificationsView(props: Parameters<typeof ViewContent>[0]) {
  const [name, setName] = useState('');
  const [minScore, setMinScore] = useState('');
  const [maxScore, setMaxScore] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState<Record<string, { name: string; minScore: string; maxScore: string }>>({});
  const active = props.classifications.filter((item) => item.status === 'ACTIVE');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await props.onCreateClassification({ name: name.trim(), minScore: Number(minScore), ...(maxScore.trim() ? { maxScore: Number(maxScore) } : { maxScore: null }), ...(description.trim() ? { description: description.trim() } : {}) }); setName(''); setMinScore(''); setMaxScore(''); setDescription(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể lưu quy tắc xếp loại.'); } finally { setBusy(false); }
  };
  return <><PageIntro eyebrow="KẾT QUẢ THI ĐUA" title="Quy tắc xếp loại" description="Thiết lập các khoảng điểm không chồng lấn cho lớp. Điểm tối đa là mốc loại trừ; bỏ trống để không giới hạn trên." />{error && <div className="inline-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Đóng thông báo"><X size={15} /></button></div>}
    {props.isTeacher && <form className="panel content-panel management-form" onSubmit={submit}><div className="panel-heading"><div><span className="eyebrow">THÊM MỨC XẾP LOẠI</span><h2>Quy tắc mới</h2></div></div><div className="management-grid"><label className="form-field">Tên xếp loại<input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Tốt" /></label><label className="form-field">Điểm từ (bao gồm)<input required type="number" step="0.01" value={minScore} onChange={(event) => setMinScore(event.target.value)} /></label><label className="form-field">Đến (không bao gồm)<input type="number" step="0.01" value={maxScore} onChange={(event) => setMaxScore(event.target.value)} placeholder="Không giới hạn" /></label><label className="form-field">Mô tả<input maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} /></label></div>{error && <div className="form-error" role="alert">{error}</div>}<div className="modal-actions"><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} Thêm mức</button></div></form>}
    <section className="panel content-panel"><div className="panel-heading"><div><span className="eyebrow">ĐANG ÁP DỤNG</span><h2>{active.length} mức xếp loại</h2></div></div>{props.classifications.length ? <div className="classification-list">{props.classifications.map((item) => <article className={`classification-row ${item.status === 'INACTIVE' ? 'classification-inactive' : ''}`} key={item.id}><span className={`status-pill ${item.status === 'ACTIVE' ? 'status-green' : 'status-muted'}`}>{item.status === 'ACTIVE' ? 'Đang dùng' : 'Đã ngừng'}</span><div><strong>{item.name}</strong><p>{item.description || 'Không có mô tả'}</p></div><span>{money(item.minScore)} ≤ điểm {item.maxScore === null ? '(không giới hạn trên)' : `< ${money(item.maxScore)}`}</span>{props.isTeacher && item.status === 'ACTIVE' && <div className="classification-actions"><details><summary>Chỉnh sửa</summary><form className="inline-edit-form" onSubmit={async (event) => { event.preventDefault(); const edit = edits[item.id] ?? { name: item.name, minScore: String(item.minScore), maxScore: item.maxScore === null ? '' : String(item.maxScore) }; try { await props.onUpdateClassification(item.id, { name: edit.name.trim(), minScore: Number(edit.minScore), maxScore: edit.maxScore.trim() ? Number(edit.maxScore) : null }); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể cập nhật ngưỡng.'); } }}><input aria-label="Tên xếp loại" required value={edits[item.id]?.name ?? item.name} onChange={(event) => setEdits({ ...edits, [item.id]: { name: event.target.value, minScore: edits[item.id]?.minScore ?? String(item.minScore), maxScore: edits[item.id]?.maxScore ?? (item.maxScore === null ? '' : String(item.maxScore)) } })} /><input aria-label="Điểm từ" type="number" step="0.01" required value={edits[item.id]?.minScore ?? String(item.minScore)} onChange={(event) => setEdits({ ...edits, [item.id]: { name: edits[item.id]?.name ?? item.name, minScore: event.target.value, maxScore: edits[item.id]?.maxScore ?? (item.maxScore === null ? '' : String(item.maxScore)) } })} /><input aria-label="Điểm đến, không bao gồm" type="number" step="0.01" placeholder="Không giới hạn" value={edits[item.id]?.maxScore ?? (item.maxScore === null ? '' : String(item.maxScore))} onChange={(event) => setEdits({ ...edits, [item.id]: { name: edits[item.id]?.name ?? item.name, minScore: edits[item.id]?.minScore ?? String(item.minScore), maxScore: event.target.value } })} /><button className="button button-outline">Lưu</button></form></details><button className="text-button" onClick={async () => { setError(''); try { await props.onDeactivateClassification(item.id); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể ngừng quy tắc.'); } }}>Ngừng áp dụng</button></div>}</article>)}</div> : <EmptyState icon={<Award size={22} />} title="Chưa có quy tắc xếp loại" description="Thêm các khoảng điểm phù hợp với cách đánh giá của lớp." />}</section>
  </>;
}

function CriteriaView(props: Parameters<typeof ViewContent>[0]) {
  const active = props.criteria.filter((criterion) => criterion.isActive);
  const [error, setError] = useState('');
  const [criterionEdit, setCriterionEdit] = useState<Record<string, { name: string; defaultPoint: string }>>({});
  return (
    <>
      <PageIntro
        eyebrow="QUY ƯỚC THI ĐUA"
        title="Tiêu chí ghi nhận"
        description="Cùng thống nhất cách ghi nhận điểm để mọi nỗ lực đều công bằng."
        action={props.isTeacher ? <button className="button button-primary" onClick={props.onNewCriterion}><Plus size={16} /> Thêm tiêu chí</button> : undefined}
      />
      <section className="criteria-summary"><div className="criteria-summary-icon"><Sparkles size={21} /></div><div><strong>{active.length} tiêu chí đang áp dụng</strong><p>Điểm tối đa, tối thiểu được thiết lập cho từng tiêu chí.</p></div><span className="summary-count">{active.length.toString().padStart(2, '0')}</span></section>
      {active.length ? <div className="criteria-grid">
        {active.map((item, index) => <article className="criterion-card" key={item.id}>
          <div className={`criterion-icon criterion-icon-${index % 4}`}>{item.type === 'BONUS' ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}</div>
          <span className={`status-pill ${item.type === 'BONUS' ? 'status-green' : 'status-rose'}`}>{item.type === 'BONUS' ? 'Điểm thưởng' : 'Điểm nhắc nhở'}</span>
          <span className="criterion-code">{item.code}</span>
          <h3>{item.name}</h3>
          <p>{item.description || 'Tiêu chí được lớp thống nhất áp dụng.'}</p>
          <div className="criterion-points"><span>Điểm mặc định</span><strong>{item.type === 'BONUS' ? '+' : '−'}{money(item.defaultPoint)}</strong></div>
          {props.isTeacher && <details className="criterion-edit"><summary>Chỉnh sửa tiêu chí</summary><form className="inline-edit-form" onSubmit={async (event) => { event.preventDefault(); setError(''); try { await props.onUpdateCriterion(item.id, { name: (criterionEdit[item.id]?.name ?? item.name).trim(), defaultPoint: Number(criterionEdit[item.id]?.defaultPoint ?? item.defaultPoint) }); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể cập nhật tiêu chí.'); } }}><input aria-label="Tên tiêu chí" required maxLength={150} value={criterionEdit[item.id]?.name ?? item.name} onChange={(event) => setCriterionEdit({ ...criterionEdit, [item.id]: { name: event.target.value, defaultPoint: criterionEdit[item.id]?.defaultPoint ?? String(item.defaultPoint) } })} /><input aria-label="Điểm mặc định" type="number" min="0" max="999999.99" step="0.01" required value={criterionEdit[item.id]?.defaultPoint ?? String(item.defaultPoint)} onChange={(event) => setCriterionEdit({ ...criterionEdit, [item.id]: { name: criterionEdit[item.id]?.name ?? item.name, defaultPoint: event.target.value } })} /><button className="button button-outline">Lưu thay đổi</button></form></details>}
        </article>)}
      </div> : <EmptyState icon={<ClipboardList size={22} />} title="Chưa có tiêu chí thi đua" description="Giáo viên có thể thêm bộ tiêu chí phù hợp với nội quy của lớp." />}
      {props.isTeacher && active.length > 0 && <section className="panel content-panel inactive-criteria"><details><summary>Ngừng áp dụng tiêu chí</summary><div>{active.map((item) => <div className="inactive-criterion-row" key={item.id}><span><strong>{item.name}</strong><small>{item.code} · {item.type === 'BONUS' ? 'Cộng' : 'Trừ'}</small></span><button className="text-button" onClick={async () => { setError(''); try { await props.onDeactivateCriterion(item.id); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể ngừng tiêu chí.'); } }}>Ngừng áp dụng</button></div>)}</div>{error && <div className="form-error" role="alert">{error}</div>}</details></section>}
    </>
  );
}

function PointRecordActions({ point, onAdjust, onVoid }: { point: PointRecord; onAdjust: (id: string, form: { newPoint: number; reason: string }) => Promise<void>; onVoid: (id: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [newPoint, setNewPoint] = useState(String(point.point));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  return <div className="point-actions">{point.status === 'ACTIVE' && <><button type="button" className="text-button" onClick={() => setOpen((value) => !value)}>{open ? 'Đóng' : 'Điều chỉnh'}</button><button type="button" className="text-button point-void-action" disabled={busy} onClick={async () => { if (!window.confirm(`Hủy hiệu lực điểm của ${point.classStudent.student.fullName}? Bản ghi sẽ được giữ trong lịch sử.`)) return; setBusy(true); try { await onVoid(point.id); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể hủy bản ghi.'); } finally { setBusy(false); } }}>Hủy điểm</button></>}
    {open && <form className="point-adjust-form" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(''); try { await onAdjust(point.id, { newPoint: Number(newPoint), reason: reason.trim() }); setOpen(false); setReason(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể điều chỉnh điểm.'); } finally { setBusy(false); } }}><label className="form-field">Điểm mới<input type="number" min="0" max="999999.99" step="0.01" required value={newPoint} onChange={(event) => setNewPoint(event.target.value)} /></label><label className="form-field">Lý do bắt buộc<textarea required minLength={1} maxLength={1000} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} /></label><button className="button button-primary" disabled={busy || !reason.trim()}>{busy ? 'Đang lưu…' : 'Lưu điều chỉnh'}</button>{error && <span className="form-error" role="alert">{error}</span>}</form>}
    {point.adjustments?.length ? <><button type="button" className="text-button" onClick={() => setShowHistory((value) => !value)}>{showHistory ? 'Ẩn lịch sử' : `Lịch sử (${point.adjustments.length})`}</button>{showHistory && <div className="point-adjust-history">{point.adjustments.map((item) => <p key={item.id}>{money(item.oldPoint)} → {money(item.newPoint)} · {item.reason}<small>{item.adjustedBy.fullName} · {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.createdAt))}</small></p>)}</div>}</> : null}
    {error && !open && <span className="form-error" role="alert">{error}</span>}
  </div>;
}

function WeeksView(props: Parameters<typeof ViewContent>[0]) {
  return (
    <>
      <PageIntro
        eyebrow="NHỊP ĐIỆU LỚP MÌNH"
        title="Tuần thi đua"
        description="Theo dõi tiến trình và trạng thái từng tuần trong năm học."
        action={props.isTeacher ? <button className="button button-primary" onClick={props.onNewWeek}><Plus size={16} /> Tạo tuần mới</button> : undefined}
      />
      {props.weeks.length ? <div className="week-list">
        {props.weeks.map((week, index) => {
          const isCurrent = week.id === props.week?.id;
          return <article className={`week-card ${isCurrent ? 'week-card-current' : ''}`} key={week.id}>
            <div className="week-number">{String(props.weeks.length - index).padStart(2, '0')}</div>
            <div className="week-calendar-icon"><CalendarDays size={19} /></div>
            <div className="week-copy"><strong>{week.name} {isCurrent && <span className="current-label">ĐANG XEM</span>}</strong><span>{dateLabel(week.startDate)} — {dateLabel(week.endDate)}</span></div>
            <span className={`status-pill ${week.isClosed || isPastWeek(week.endDate) ? 'status-muted' : 'status-green'}`}>{week.isClosed ? 'Đã khóa' : isPastWeek(week.endDate) ? 'Đã kết thúc' : 'Đang mở'}</span>
            {props.isTeacher && !isPastWeek(week.endDate) && <button className={`button ${week.isClosed ? 'button-outline' : 'button-soft'}`} onClick={() => void props.onWeekAction(week.id, week.isClosed)}>{week.isClosed ? 'Mở lại tuần' : 'Khóa tuần'}</button>}
          </article>;
        })}
      </div> : <EmptyState icon={<CalendarDays size={22} />} title="Chưa có tuần thi đua" description="Tạo tuần đầu tiên để bắt đầu ghi nhận điểm trong lớp." action={props.isTeacher ? <button className="button button-primary" onClick={props.onNewWeek}><Plus size={16} /> Tạo tuần đầu tiên</button> : undefined} />}
    </>
  );
}

function ReportsView(props: Parameters<typeof ViewContent>[0]) {
  const report = props.studentReport;
  const sortedResults = [...(report?.results ?? [])].sort((a, b) =>
    compareVietnameseNames(a.fullName, b.fullName) ||
    studentNameCollator.compare(a.studentCode, b.studentCode),
  );
  return (
    <>
      <PageIntro
        eyebrow="NHÌN LẠI MỘT CHẶNG ĐƯỜNG"
        title="Báo cáo thi đua"
        description={props.week ? `${props.week.name} · ${dateLabel(props.week.startDate)} — ${dateLabel(props.week.endDate)}` : 'Chọn một tuần để xem báo cáo.'}
        action={<button className="button button-primary" onClick={() => void props.onExport()} disabled={!props.week}><Download size={16} /> Tải Excel</button>}
      />
      <section className="report-highlight">
        <div className="report-highlight-copy"><span className="eyebrow">BẢNG XẾP HẠNG CÁ NHÂN</span><h2>Nỗ lực hôm nay,<br /><em>thành quả ngày mai.</em></h2><p>Bảng điểm được tổng hợp từ các lượt ghi nhận trong tuần.</p></div>
        <div className="report-decoration"><BarChart3 size={66} strokeWidth={1.15} /><span>WEEKLY<br />REPORT</span></div>
      </section>
      <section className="panel content-panel">
        <div className="panel-heading report-table-heading"><div><span className="eyebrow">KẾT QUẢ CHI TIẾT</span><h2>{report?.week.name ?? 'Chưa có dữ liệu'}</h2></div><span className="result-count">{report?.results.length ?? 0} học sinh</span></div>
        {sortedResults.length ? <div className="table-scroll"><table className="data-table">
          <thead><tr><th>HẠNG</th><th>HỌC SINH</th><th className="align-right">THƯỞNG</th><th className="align-right">NHẮC NHỞ</th><th className="align-right">ĐIỂM RÒNG</th><th>XẾP LOẠI</th></tr></thead>
          <tbody>{sortedResults.map((item) => <tr key={item.classStudentId}>
            <td><RankBadge rank={item.rank} /></td>
            <td><div className="table-person"><Avatar name={item.fullName} size="small" /><span><strong>{item.fullName}</strong><small>{item.studentCode}</small></span></div></td>
            <td className="align-right positive">{money(item.bonusPoints)}</td>
            <td className="align-right negative">{money(item.penaltyPoints)}</td>
            <td className="align-right point-value">{money(item.netScore)}</td>
            <td>{item.classification ? <span className="status-pill status-green">{item.classification}</span> : <span className="muted-cell">—</span>}</td>
          </tr>)}</tbody>
        </table></div> : <EmptyState icon={<BarChart3 size={22} />} title="Chưa có kết quả tuần này" description="Báo cáo sẽ được tổng hợp khi có học sinh và dữ liệu điểm." />}
      </section>
    </>
  );
}

function PointsHistoryView(props: Parameters<typeof ViewContent>[0]) {
  const [query, setQuery] = useState('');
  const visible = props.points.filter((item) =>
    `${item.classStudent.student.fullName} ${item.classStudent.student.studentCode} ${item.criterion.name} ${item.description ?? ''}`
      .toLocaleLowerCase('vi-VN').includes(query.trim().toLocaleLowerCase('vi-VN')),
  );
  const canManage = props.isTeacher && !!props.week && !props.week.isClosed && !isPastWeek(props.week.endDate);
  return <><PageIntro eyebrow="MINH BẠCH VÀ CÔNG BẰNG" title="Lịch sử điểm" description={props.week ? `${props.week.name} · gồm cả điểm đã hủy và các lần điều chỉnh` : 'Chọn tuần để xem lịch sử điểm.'} />
    <section className="panel content-panel"><div className="toolbar"><div className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm học sinh, tiêu chí hoặc ghi chú" /></div><span className="result-count">{visible.length} bản ghi</span></div>
      {visible.length ? <div className="table-scroll"><table className="data-table history-table"><thead><tr><th>THỜI GIAN</th><th>HỌC SINH</th><th>TIÊU CHÍ</th><th>TRẠNG THÁI</th><th className="align-right">ĐIỂM</th>{canManage && <th>THAO TÁC</th>}</tr></thead><tbody>{visible.map((point) => <tr key={point.id} className={point.status === 'VOIDED' ? 'voided-row' : ''}><td className="muted-cell">{new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(point.createdAt))}</td><td><div className="table-person"><Avatar name={point.classStudent.student.fullName} size="tiny" /><span><strong>{point.classStudent.student.fullName}</strong><small>{point.classStudent.student.studentCode}</small></span></div></td><td><span className={`criterion-pill ${point.type === 'BONUS' ? 'pill-bonus' : 'pill-penalty'}`}>{point.criterion.name}</span>{point.description && <small className="history-description">{point.description}</small>}</td><td><span className={`status-pill ${point.status === 'ACTIVE' ? 'status-green' : 'status-muted'}`}>{point.status === 'ACTIVE' ? 'Có hiệu lực' : 'Đã hủy'}</span></td><td className={`align-right point-value ${point.type === 'BONUS' ? 'positive' : 'negative'}`}>{point.type === 'BONUS' ? '+' : '−'}{money(point.point)}</td>{canManage && <td><PointRecordActions point={point} onAdjust={props.onAdjustPoint} onVoid={props.onVoidPoint} /></td>}</tr>)}</tbody></table></div> : <EmptyState icon={<History size={22} />} title="Chưa có ghi nhận điểm" description="Các lần ghi nhận trong tuần sẽ xuất hiện tại đây." />}
    </section></>;
}

function MetricCard({ label, value, note, icon, tint, trend }: { label: string; value: string; note: string; icon: ReactNode; tint: string; trend: string }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon metric-${tint}`}>{icon}</span></div><div className="metric-value">{value}<small>{note}</small></div><div className="metric-trend"><span className={`trend-dot trend-${tint}`} />{trend}</div></article>;
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <section className="page-intro"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p className="page-description">{description}</p></div>{action}</section>;
}

function Avatar({ name, size = 'normal' }: { name: string; size?: 'tiny' | 'small' | 'normal' }) {
  const color = name.length % 4;
  return <span className={`avatar avatar-${size} avatar-color-${color}`}>{initials(name)}</span>;
}

function RankBadge({ rank }: { rank: number }) {
  return <span className={`rank-badge ${rank <= 3 ? `rank-${rank}` : ''}`}>{rank === 1 ? <Trophy size={14} fill="currentColor" /> : String(rank).padStart(2, '0')}</span>;
}

function EmptyInline({ title, description }: { title: string; description: string }) {
  return <div className="empty-inline"><div className="empty-inline-icon"><Sparkles size={16} /></div><strong>{title}</strong><p>{description}</p></div>;
}

function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-state-icon">{icon}</div><h3>{title}</h3><p>{description}</p>{action}</div>;
}

function NoClassroom({ onCreate }: { onCreate: () => void }) {
  return <div className="welcome-empty"><div className="welcome-empty-art"><div className="art-sun" /><div className="art-book"><GraduationCap size={36} /></div><span className="art-spark art-spark-one">✳</span><span className="art-spark art-spark-two">✦</span></div><span className="eyebrow">BẮT ĐẦU HÀNH TRÌNH MỚI</span><h1>Lớp học của bạn,<br /><em>những câu chuyện đáng nhớ.</em></h1><p>Tạo không gian thi đua đầu tiên để cùng lớp ghi nhận những nỗ lực mỗi ngày.</p><button className="button button-primary button-large" onClick={onCreate}><Plus size={17} /> Tạo lớp học đầu tiên</button></div>;
}

function NoWeek({ isTeacher, onCreate, onOpenWeeks }: { isTeacher: boolean; onCreate: () => void; onOpenWeeks: () => void }) {
  return <div className="no-week"><div className="empty-state-icon"><CalendarDays size={22} /></div><h2>Chưa có tuần thi đua</h2><p>{isTeacher ? 'Tạo tuần thi đua đầu tiên để bắt đầu ghi nhận điểm và xem bảng xếp hạng.' : 'Giáo viên chưa thiết lập tuần thi đua cho lớp này.'}</p>{isTeacher && <button className="button button-primary" onClick={onCreate}><Plus size={16} /> Tạo tuần thi đua</button>}{!isTeacher && <button className="button button-outline" onClick={onOpenWeeks}>Xem các tuần</button>}</div>;
}

function LoadingScreen({ label }: { label: string }) {
  return <div className="loading-screen"><div className="loading-brand"><div className="brand-mark"><GraduationCap size={23} /></div><strong>class point</strong></div><LoaderCircle className="loading-spinner" size={23} /><span>{label}</span></div>;
}

function AuthScreen({ onSubmit, busy, error }: { onSubmit: (identifier: string, password: string, mode: 'login' | 'register', extra?: { email: string; fullName: string }) => Promise<void>; busy: boolean; error: string }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSubmit(identifier, password, mode, { email, fullName });
  };
  return <main className="auth-page">
    <section className="auth-visual">
      <div className="auth-brand"><div className="brand-mark"><GraduationCap size={23} /></div><strong>class point</strong><span>CLASSROOM STUDIO</span></div>
      <div className="auth-visual-copy"><span className="eyebrow"><Sparkles size={14} /> CÙNG LỚP MÌNH TỎA SÁNG</span><h1>Điểm số ghi nhận,<br /><em>nỗ lực được nhìn thấy.</em></h1><p>Một không gian tích cực để mỗi học sinh được khích lệ, mỗi tập thể cùng trưởng thành.</p>
        <div className="auth-illustration"><div className="illustration-paper"><div className="paper-top"><span /> <span /> <span /></div><div className="paper-title">TUẦN NÀY<br />MÌNH CÙNG CỐ GẮNG</div><div className="paper-chart"><i /><i /><i /><i /><i /><i /><i /></div><div className="paper-star">✦</div><div className="paper-smile">☺</div></div><div className="illustration-orbit orbit-one" /><div className="illustration-orbit orbit-two" /><span className="float-star float-star-one">✳</span><span className="float-star float-star-two">✦</span></div>
      </div>
      <div className="auth-visual-footer"><span>THÊM MỘT ĐIỂM CỘNG MỖI NGÀY.</span><span>01 — 05</span></div>
    </section>
    <section className="auth-panel"><div className="auth-form-wrap">
      <div className="auth-mobile-brand"><div className="brand-mark"><GraduationCap size={23} /></div><strong>class point</strong></div>
      <span className="eyebrow">XIN CHÀO, BẠN ƠI</span><h2>{mode === 'login' ? 'Mừng bạn quay lại!' : 'Cùng bắt đầu nhé!'}</h2><p className="auth-subtitle">{mode === 'login' ? 'Đăng nhập để tiếp tục hành trình cùng lớp mình.' : 'Tạo tài khoản để đồng hành cùng lớp học.'}</p>
      <form className="auth-form" onSubmit={submit}>
        {mode === 'register' && <>
          <label>Họ và tên<input autoComplete="name" required maxLength={150} value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Ví dụ: Nguyễn Minh Anh" /></label>
          <label>Tên đăng nhập<input autoComplete="username" required minLength={3} maxLength={50} value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="minhanh_01" /></label>
          <label>Email<input autoComplete="email" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ban@truong.edu.vn" /></label>
        </>}
        {mode === 'login' && <label>Tên đăng nhập hoặc email<input autoComplete="username" required maxLength={254} value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Nhập tài khoản của bạn" /></label>}
        <label>Mật khẩu<input autoComplete={mode === 'login' ? 'current-password' : 'new-password'} type="password" required minLength={12} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Ít nhất 12 ký tự" /></label>
        {error && <div className="form-error" role="alert"><ShieldCheck size={16} />{error}</div>}
        <button className="button button-primary auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}{!busy && <ArrowRight size={17} />}</button>
      </form>
      <p className="auth-switch">{mode === 'login' ? 'Bạn chưa có tài khoản?' : 'Đã có tài khoản?'} <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Đăng ký ngay' : 'Đăng nhập'}</button></p>
      <div className="auth-trust"><ShieldCheck size={16} /><span>Thông tin lớp học được bảo vệ và chỉ chia sẻ đúng phạm vi.</span></div>
      <span className="auth-copyright">© 2026 CLASS POINT · MỌI NỖ LỰC ĐỀU CÓ GIÁ TRỊ</span>
    </div></section>
  </main>;
}

function ModalFrame({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true">{children}</section></div>;
}

function ModalHeader({ eyebrow, title, description, onClose }: { eyebrow: string; title: string; description: string; onClose: () => void }) {
  return <div className="modal-header"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div><button className="icon-button" onClick={onClose} aria-label="Đóng"><X size={19} /></button></div>;
}

function PointModal({ students, teams, criteria, weeks, onClose, onSubmit }: { students: StudentEnrollment[]; teams: Team[]; criteria: Criterion[]; weeks: CompetitionWeek[]; onClose: () => void; onSubmit: (form: { classStudentId: string; criterionId: string; weekId: string; description?: string }) => Promise<void> }) {
  const sortedTeams = [...teams].sort((a, b) => {
    const numberA = Number(a.code.match(/\d+/)?.[0]);
    const numberB = Number(b.code.match(/\d+/)?.[0]);
    if (Number.isFinite(numberA) && Number.isFinite(numberB)) return numberA - numberB;
    if (Number.isFinite(numberA)) return -1;
    if (Number.isFinite(numberB)) return 1;
    return a.name.localeCompare(b.name, 'vi');
  });
  const [teamId, setTeamId] = useState(sortedTeams[0]?.id ?? '');
  const [studentId, setStudentId] = useState('');
  const [criterionId, setCriterionId] = useState(criteria[0]?.id ?? '');
  const [weekId, setWeekId] = useState(weeks[0]?.id ?? '');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selectedTeam = teams.find((item) => item.id === teamId);
  const teamStudentIds = new Set(selectedTeam?.memberships.map((membership) => membership.classStudent.id) ?? []);
  const teamStudents = students.filter((item) => teamStudentIds.has(item.id));
  const selectedCriterion = criteria.find((item) => item.id === criterionId);
  const selectTeam = (nextTeamId: string) => {
    setTeamId(nextTeamId);
    const nextTeam = teams.find((item) => item.id === nextTeamId);
    const nextMemberIds = new Set(nextTeam?.memberships.map((membership) => membership.classStudent.id) ?? []);
    setStudentId(students.find((item) => nextMemberIds.has(item.id))?.id ?? '');
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit({ classStudentId: studentId, criterionId, weekId, ...(description.trim() && { description: description.trim() }) });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể ghi nhận điểm.');
    } finally {
      setBusy(false);
    }
  };
  return <form onSubmit={submit}>
    <ModalHeader eyebrow="GHI NHẬN KHOẢNH KHẮC TỐT" title="Thêm điểm thi đua" description="Mỗi lời ghi nhận là một động lực để cố gắng hơn." onClose={onClose} />
    {!students.length || !teams.length || !criteria.length || !weeks.length ? <div className="modal-prerequisite"><CircleHelp size={18} /><span>Cần có nhóm, học sinh, tiêu chí đang hoạt động và tuần hiện tại chưa khóa trước khi nhập điểm.</span></div> : <>
      <label className="form-field">Nhóm / tổ<select required value={teamId} onChange={(event) => selectTeam(event.target.value)}>{sortedTeams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="form-field">Học sinh<select required value={studentId} disabled={!teamStudents.length} onChange={(event) => setStudentId(event.target.value)}>{teamStudents.length ? teamStudents.map((item) => <option key={item.id} value={item.id}>{item.student.fullName} · {item.student.studentCode}</option>) : <option value="">Nhóm chưa có thành viên</option>}</select></label>
      <label className="form-field">Tiêu chí<select required value={criterionId} onChange={(event) => setCriterionId(event.target.value)}>{criteria.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.type === 'BONUS' ? '+' : '−'}{money(item.defaultPoint)}</option>)}</select></label>
      <label className="form-field">Tuần thi đua<select required value={weekId} onChange={(event) => setWeekId(event.target.value)}>{weeks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="form-field">Số điểm <span className="field-note">Cố định theo tiêu chí</span><output className="form-readonly-value">{selectedCriterion ? `${selectedCriterion.type === 'BONUS' ? '+' : '−'}${money(selectedCriterion.defaultPoint)}` : '—'}</output></label>
      <label className="form-field">Lời nhắn <span className="field-note">Không bắt buộc</span><textarea rows={3} maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ghi lại điều đáng tự hào hôm nay…" /></label>
    </>}
    {error && <div className="form-error"><ShieldCheck size={16} />{error}</div>}
    <div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Để sau</button><button className="button button-primary" disabled={busy || !teamStudents.length || !criteria.length || !weeks.length}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} Lưu ghi nhận</button></div>
  </form>;
}

function CriterionModal({ classroomId: _classroomId, onClose, onSubmit }: { classroomId: string; onClose: () => void; onSubmit: (form: { code: string; name: string; type: 'BONUS' | 'PENALTY'; defaultPoint: number; minPoint?: number; maxPoint?: number }) => Promise<void> }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState<'BONUS' | 'PENALTY'>('BONUS');
  const [defaultPoint, setDefaultPoint] = useState('1');
  const [minPoint, setMinPoint] = useState('');
  const [maxPoint, setMaxPoint] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await onSubmit({ name: name.trim(), code: code.trim().toUpperCase(), type, defaultPoint: Number(defaultPoint), ...(minPoint && { minPoint: Number(minPoint) }), ...(maxPoint && { maxPoint: Number(maxPoint) }) });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể thêm tiêu chí.'); } finally { setBusy(false); }
  };
  return <form onSubmit={submit}>
    <ModalHeader eyebrow="QUY ƯỚC CỦA LỚP" title="Thêm tiêu chí" description="Thiết lập cách ghi nhận điểm rõ ràng, công bằng." onClose={onClose} />
    <label className="form-field">Tên tiêu chí<input required maxLength={150} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Giúp đỡ bạn bè" /></label>
    <label className="form-field">Mã tiêu chí<input required maxLength={40} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="VD: HELP-01" /></label>
    <label className="form-field">Loại điểm<select value={type} onChange={(event) => setType(event.target.value as 'BONUS' | 'PENALTY')}><option value="BONUS">Điểm thưởng</option><option value="PENALTY">Điểm nhắc nhở</option></select></label>
    <div className="form-grid-two"><label className="form-field">Điểm mặc định<input required type="number" min="0" max="999999.99" step="0.01" value={defaultPoint} onChange={(event) => setDefaultPoint(event.target.value)} /></label><label className="form-field">Điểm tối thiểu<input type="number" min="0" step="0.01" value={minPoint} onChange={(event) => setMinPoint(event.target.value)} placeholder="Không giới hạn" /></label></div>
    <label className="form-field">Điểm tối đa<input type="number" min="0" step="0.01" value={maxPoint} onChange={(event) => setMaxPoint(event.target.value)} placeholder="Không giới hạn" /></label>
    {error && <div className="form-error"><ShieldCheck size={16} />{error}</div>}
    <div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Hủy</button><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} Thêm tiêu chí</button></div>
  </form>;
}

function WeekModal({ classroomId: _classroomId, onClose, onSubmit }: { classroomId: string; onClose: () => void; onSubmit: (form: { name: string; startDate: string; endDate: string }) => Promise<void> }) {
  const monday = useMemo(() => {
    const now = new Date();
    const day = (now.getDay() + 6) % 7;
    now.setDate(now.getDate() - day);
    return now.toISOString().slice(0, 10);
  }, []);
  const sunday = useMemo(() => {
    const date = new Date(`${monday}T00:00:00`);
    date.setDate(date.getDate() + 6);
    return date.toISOString().slice(0, 10);
  }, [monday]);
  const [name, setName] = useState('Tuần thi đua mới');
  const [startDate, setStartDate] = useState(monday);
  const [endDate, setEndDate] = useState(sunday);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await onSubmit({ name: name.trim(), startDate, endDate }); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể tạo tuần.'); } finally { setBusy(false); }
  };
  return <form onSubmit={submit}>
    <ModalHeader eyebrow="BẮT ĐẦU CHẶNG ĐUA MỚI" title="Tạo tuần thi đua" description="Tuần thi đua bắt đầu từ thứ Hai và kết thúc vào Chủ nhật." onClose={onClose} />
    <label className="form-field">Tên tuần<input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Tuần 01" /></label>
    <div className="form-grid-two"><label className="form-field">Ngày bắt đầu<input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label className="form-field">Ngày kết thúc<input required type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></div>
    {error && <div className="form-error"><ShieldCheck size={16} />{error}</div>}
    <div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Hủy</button><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <CalendarDays size={16} />} Tạo tuần</button></div>
  </form>;
}

function ClassroomModal({ academicYears, onClose, onCreateAcademicYear, onSubmit }: { academicYears: AcademicYear[]; onClose: () => void; onCreateAcademicYear: (form: { name: string; startDate: string; endDate: string }) => Promise<AcademicYear>; onSubmit: (form: { name: string; code: string; academicYearId: string }) => Promise<void> }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [yearId, setYearId] = useState(academicYears[0]?.id ?? '');
  const [yearName, setYearName] = useState('');
  const [yearStartDate, setYearStartDate] = useState('');
  const [yearEndDate, setYearEndDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await onSubmit({ name: name.trim(), code: code.trim().toUpperCase(), academicYearId: yearId }); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể tạo lớp học.'); } finally { setBusy(false); }
  };
  const createAcademicYear = async () => {
    setBusy(true); setError('');
    try {
      const year = await onCreateAcademicYear({
        name: yearName.trim(),
        startDate: yearStartDate,
        endDate: yearEndDate,
      });
      setYearId(year.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tạo năm học.');
    } finally {
      setBusy(false);
    }
  };
  return <form onSubmit={submit}>
    <ModalHeader eyebrow="KHỞI TẠO KHÔNG GIAN MỚI" title="Tạo lớp học" description="Bạn sẽ trở thành giáo viên chủ nhiệm của lớp này." onClose={onClose} />
    {!academicYears.length ? <>
      <div className="modal-prerequisite"><CircleHelp size={18} /><span>Chưa có năm học. Tạo năm học trước, sau đó bạn có thể tiếp tục tạo lớp.</span></div>
      <label className="form-field">Tên năm học<input required maxLength={30} value={yearName} onChange={(event) => setYearName(event.target.value)} placeholder="Ví dụ: 2026-2027" /></label>
      <div className="form-grid-two"><label className="form-field">Ngày bắt đầu<input required type="date" value={yearStartDate} onChange={(event) => setYearStartDate(event.target.value)} /></label><label className="form-field">Ngày kết thúc<input required type="date" value={yearEndDate} onChange={(event) => setYearEndDate(event.target.value)} /></label></div>
      <div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Hủy</button><button type="button" className="button button-primary" disabled={busy || !yearName.trim() || !yearStartDate || !yearEndDate || yearEndDate <= yearStartDate} onClick={() => void createAcademicYear()}>{busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} Tạo năm học</button></div>
    </> : <>
      <label className="form-field">Tên lớp<input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Lớp 6A" /></label>
      <label className="form-field">Mã lớp<input required maxLength={30} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Ví dụ: 6A-2026" /></label>
      <label className="form-field">Năm học<select required value={yearId} onChange={(event) => setYearId(event.target.value)}>{academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
    </>}
    {error && <div className="form-error"><ShieldCheck size={16} />{error}</div>}
    {academicYears.length > 0 && <div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Hủy</button><button className="button button-primary" disabled={busy || !yearId}>{busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} Tạo lớp</button></div>}
  </form>;
}

function viewLabel(view: View) {
  return navigation.find((item) => item.id === view)?.label ?? 'Tổng quan';
}

function roleLabel(role?: Classroom['role']) {
  if (role === 'HOMEROOM_TEACHER') return 'Giáo viên chủ nhiệm';
  if (role === 'TEAM_LEADER') return 'Tổ trưởng';
  if (role === 'STUDENT') return 'Học sinh';
  return 'Tài khoản CLASS POINT';
}

export default App;
