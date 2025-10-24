import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useReportsContext } from "@/contexts/ReportsContext";
import { useAttendance } from "@/contexts/AttendanceContext";
import { useStudent } from "@/contexts/StudentContext";
import { UserCheck, UserX, Calendar as LucideCalendar, Clock as LucideClock } from "lucide-react";
// Recharts for interactive charts
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
} from 'recharts';
import { PieChart, Pie } from 'recharts';
import axios from 'axios';
import { useClass } from "@/contexts/ClassContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function Reports() {
  const { reports, fetchReports, fetchAbsenceCount, fetchClassMonthlyStats } = useReportsContext();
  const { fetchBehaviorStats } = useReportsContext();
  const { fetchNoAbsenceStudents } = useReportsContext();
  const { fetchAttendance } = useAttendance();
  const { fetchStudents } = useStudent();
  const { classes } = useClass();
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [classStudents, setClassStudents] = useState([]);
  const [statsMonth, setStatsMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
  });
  const [attendanceStats, setAttendanceStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [monthlySeries, setMonthlySeries] = useState(null);
  const [stagePieData, setStagePieData] = useState(null);
  const [stagePieLoading, setStagePieLoading] = useState(false);
  const [selectedStage, setSelectedStage] = useState(null);
  const [schoolPieData, setSchoolPieData] = useState(null);
  const [schoolPieLoading, setSchoolPieLoading] = useState(false);
  const [classPieData, setClassPieData] = useState(null);
  const [classPieLoading, setClassPieLoading] = useState(false);
  const [topStudents, setTopStudents] = useState(null);
  const [behaviorStats, setBehaviorStats] = useState(null);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  // Render XAxis tick with wrapping (split label by spaces and render up to 3 lines)
  const renderWrappedTick = (props) => {
    const { x, y, payload } = props;
    const label = String(payload.value || '');
    const words = label.split(' ');
    // split into up to 3 lines, roughly balancing words
    const lines = [];
    if (words.length <= 3) {
      lines.push(label);
    } else {
      // try to split into 2-3 lines evenly
      const per = Math.ceil(words.length / 3);
      for (let i = 0; i < words.length; i += per) {
        lines.push(words.slice(i, i + per).join(' '));
        if (lines.length >= 3) break;
      }
    }
    return (
      <g transform={`translate(${x},${y})`}>
        {lines.map((ln, idx) => (
          <text key={idx} x={0} y={idx * 14} textAnchor="middle" fontSize={12} fill="#374151">{ln}</text>
        ))}
      </g>
    );
  };

  // Behavior categories mapping (id -> label). Order corresponds to numeric ids returned by the API.
  const behaviorCategories = [
    'الفوضى_داخل_الفصل_أو_المدرسة',
    'الشغب_في_وسائل_النقل_المدرسي',
    'الخروج_المتكرر_من_الحصص',
    'التأخر_عن_العودة_إلى_الصف',
    'التأخر_الصباحي_بعد_نصف_ساعة',
    'العبث_في_ممتلكات_المدرسة',
    'العبث_في_ممتلكات_الأصدقاء',
    'التفوه_بألفاظ_غير_لائقة',
    'عدم_الالتزام_بالزي',
    'إحضار_الممنوعات',
    'عدم_الانضباط_في_الطابور',
    'وضع_المساحيق',
    'إصابة_طالبة_عمدًا_عن_طريق_الضرب',
    'تناول_الأطعمة_في_الصف',
    'عدم_النزول_في_الساحة_أثناء_الطابور_والفسحة',
    'التخويف_وإثارة_الرعب_وممارسة_الألعاب',
    'أخرى'
  ];

  // Palette - one color per category (will cycle if fewer colors than categories)
  const categoryColors = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#db2777', '#64748b', '#0ea5a4', '#7c3aed', '#a3e635', '#94a3b8'];
  // Dedicated palettes for the three pies to make them visually distinct
  const stagePalette = ['#ef4444', '#f97316']; // stage pie (red/orange) — absent/present
  const schoolPalette = ['#3b82f6', '#10b981']; // school pie (blue/green)
  const classPalette = ['#8b5cf6', '#f59e0b'];  // single-class pie (purple/yellow)
  
  const [sortOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [selectedReport] = useState(null);
  const [open, setOpen] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [selectedStudentForCount, setSelectedStudentForCount] = useState(null);
  // absenceCount removed (unused)
  const [countLoading, setCountLoading] = useState(false);
  const [excusedCount, setExcusedCount] = useState(null);
  const [unexcusedCount, setUnexcusedCount] = useState(null);
  

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Detect small screens to adjust chart labels / radii
  useEffect(() => {
    const check = () => {
      try {
        setIsSmallScreen(typeof window !== 'undefined' && window.innerWidth <= 480);
      } catch {
        setIsSmallScreen(false);
      }
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Load students for the selected class only
  useEffect(() => {
    if (!selectedClassId) {
      setClassStudents([]);
      setSelectedStudentForCount(null);
      return;
    }
    const loadClassStudents = async () => {
      try {
        const s = await fetchStudents(Number(selectedClassId));
        setClassStudents(Array.isArray(s) ? s : s ? [s] : []);
      } catch {
        setClassStudents([]);
      }
    };
    loadClassStudents();
  }, [selectedClassId, fetchStudents]);

  // compute attendance stats for the selected class only
  useEffect(() => {
    const compute = async () => {
      if (!selectedClassId) {
        setAttendanceStats(null);
        return;
      }
      try {
        setStatsLoading(true);
        const [year, mon] = (statsMonth || '').split('-').map((s) => Number(s));
        const monthKey = statsMonth; // YYYY-MM

        // Always treat the selection as monthly: only query the selected month
        const quarterMonths = [monthKey];

        // fetch roster for the selected class
        const roster = Array.isArray(classStudents) && classStudents.length > 0
          ? classStudents
          : Array.isArray(await fetchStudents(Number(selectedClassId))) ? await fetchStudents(Number(selectedClassId)) : [];

        // Prefer server-side monthly stats endpoint when available
        let monthStats = null;
        try {
          monthStats = await fetchClassMonthlyStats(Number(selectedClassId), year, mon);
        } catch {
          monthStats = null;
        }

        // If server returned monthly counts or per-student stats, prefer those.
        // monthStats may contain { count3, count5, count10 } or { students: [...] }
        let monthRecords = [];
        let useCountsDirectly = false;
        let directCount3 = undefined;
        let directCount5 = undefined;
        if (monthStats) {
          if (typeof monthStats.count3 === 'number' || typeof monthStats.count5 === 'number') {
            useCountsDirectly = true;
            directCount3 = typeof monthStats.count3 === 'number' ? monthStats.count3 : undefined;
            directCount5 = typeof monthStats.count5 === 'number' ? monthStats.count5 : undefined;
          }
          if (Array.isArray(monthStats.students)) {
            // transform per-student stats into synthetic records
            monthRecords = monthStats.students.map((s) => ({ studentId: s.studentId ?? s.id, absentDays: (s.absentDays ?? s.absences ?? s.absent) || 0, isAbsent: false }));
          }
        }

        if (!monthRecords.length && !useCountsDirectly) {
          // fetch raw attendance records as fallback
          const fetchForClassMonth = async (mk) => {
            try {
              const data = await fetchAttendance(Number(selectedClassId), mk);
              return Array.isArray(data) ? data : data ? [data] : [];
            } catch {
              return [];
            }
          };
          monthRecords = await fetchForClassMonth(monthKey);
        }

        // Build quarter months and collect per-student absentDays or raw records
        const quarterRecords = [];
        // We'll also collect per-student absentDays aggregated across the quarter when possible
        const quarterStudentMap = new Map();
        for (const mk of quarterMonths) {
          const [y, m] = mk.split('-').map((s) => Number(s));
          try {
            const st = await fetchClassMonthlyStats(Number(selectedClassId), y, m);
            if (st) {
              if (Array.isArray(st.students) && st.students.length > 0) {
                // aggregate absentDays per student
                for (const s of st.students) {
                  const sid = s.studentId ?? s.id ?? null;
                  if (sid == null) continue;
                  const add = Number(s.absentDays ?? s.absences ?? s.absent) || 0;
                  quarterStudentMap.set(String(sid), (quarterStudentMap.get(String(sid)) || 0) + add);
                }
                continue;
              }
              // if st has count10 but no students, we still can't compute per-student quarter absence
              // so fallback to raw attendance rows below
            }
            // fallback to attendance rows for this month
            const rows = await fetchAttendance(Number(selectedClassId), mk);
            quarterRecords.push(...(Array.isArray(rows) ? rows : rows ? [rows] : []));
          } catch {
            // ignore per-month failure and continue
          }
        }

        const absenceCountMonth = new Map();
        const absenceCountQuarter = new Map();

        const accumulate = (recList, map) => {
          for (const r of recList) {
            try {
              const sid = r.studentId ?? (r.student && r.student.id) ?? null;
              const name = (r.name ?? (r.student && r.student.name) ?? '').trim();
              const key = sid != null ? String(sid) : `name:${name}`;
              // now support both raw rows (isAbsent flags per-day) and per-student stats with absentDays
              const add = typeof r.absentDays === 'number' ? r.absentDays : (r.isAbsent || r.isAbsent === true ? 1 : 0);
              if (add) map.set(key, (map.get(key) || 0) + add);
            } catch {
              // ignore malformed record
            }
          }
        };

        accumulate(monthRecords, absenceCountMonth);
        // If we aggregated quarterStudentMap from server per-student data, use it to populate absenceCountQuarter
        if (quarterStudentMap.size > 0) {
          for (const [sid, val] of quarterStudentMap.entries()) {
            absenceCountQuarter.set(sid, val);
          }
        }
        // Still accumulate any raw quarterRecords
        accumulate(quarterRecords, absenceCountQuarter);

        // If server provided direct monthly counts prefer them
        const count3 = typeof directCount3 === 'number' ? directCount3 : roster.filter((s) => {
          const key = s.id != null ? String(s.id) : `name:${(s.name||'').trim()}`;
          return (absenceCountMonth.get(key) || 0) >= 3;
        }).length;

        const count5 = typeof directCount5 === 'number' ? directCount5 : roster.filter((s) => {
          const key = s.id != null ? String(s.id) : `name:${(s.name||'').trim()}`;
          return (absenceCountMonth.get(key) || 0) >= 5;
        }).length;

        // Count >10 days calculated per selected month (monthly) as requested
        const count10 = roster.filter((s) => {
          const key = s.id != null ? String(s.id) : `name:${(s.name||'').trim()}`;
          return (absenceCountMonth.get(key) || 0) >= 10;
        }).length;

        // Try to use server-provided no-absence endpoint to get regular students directly
        let regularStudents = roster.filter((s) => {
          const key = s.id != null ? String(s.id) : `name:${(s.name||'').trim()}`;
          return (absenceCountQuarter.get(key) || 0) === 0;
        }).map((s) => ({ id: s.id, name: s.name }));
        try {
          const [y, m] = (statsMonth || '').split('-').map((s) => Number(s));
          const serverRegular = await fetchNoAbsenceStudents(Number(selectedClassId), y, m);
          if (Array.isArray(serverRegular) && serverRegular.length > 0) {
            // Normalize server items to { id, name }
            regularStudents = serverRegular.map((x) => ({ id: x.id ?? x.studentId ?? x.student?.id, name: x.name ?? x.student?.name ?? x.fullName ?? x.studentName ?? String(x) }));
          }
        } catch {
          // ignore and continue using client-aggregated regularStudents
        }

        setAttendanceStats({ count3, count5, count10, regularStudents, rosterLength: roster.length });
        // prepare monthly series for charting: gather 12 months ending at selected month
            (async () => {
          try {
            const [selY, selM] = (statsMonth || '').split('-').map((s) => Number(s));
            const months = [];
            for (let i = 11; i >= 0; i--) {
              const dt = new Date(selY, selM - 1 - i, 1);
              months.push({ year: dt.getFullYear(), month: dt.getMonth() + 1, key: `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}` });
            }
            // fetch stats in parallel
            const results = await Promise.all(months.map(async (m) => {
              try {
                const st = await fetchClassMonthlyStats(Number(selectedClassId), m.year, m.month);
                return { key: m.key, year: m.year, month: m.month, data: st };
              } catch {
                return { key: m.key, year: m.year, month: m.month, data: null };
              }
            }));
            // normalize to chart data
            const chart = results.map((r) => {
              const label = new Date(r.year, r.month - 1).toLocaleString('ar-EG', { month: 'short' });
              const st = r.data;
              const c3 = st && typeof st.count3 === 'number' ? st.count3 : (Array.isArray(st?.students) ? st.students.filter(s => (Number(s.absentDays ?? s.absences ?? s.absent) || 0) >= 3).length : 0);
              const c5 = st && typeof st.count5 === 'number' ? st.count5 : (Array.isArray(st?.students) ? st.students.filter(s => (Number(s.absentDays ?? s.absences ?? s.absent) || 0) >= 5).length : 0);
              return { monthKey: r.key, label, count3: c3, count5: c5 };
            });
            setMonthlySeries(chart);
            // fetch behavior stats for the selected month
            (async () => {
              try {
                const [y, m] = (statsMonth || '').split('-').map((s) => Number(s));
                const bs = await fetchBehaviorStats(Number(selectedClassId), y, m);
                setBehaviorStats(bs);
              } catch {
                setBehaviorStats(null);
              }
            })();
            // compute top absent students for the selected month (top 10)
            try {
              const map = new Map();

              // Helper to add absentDays to a map entry
              const addToMap = (id, name, days) => {
                const key = id != null ? String(id) : `name:${(name || '').trim()}`;
                const prev = map.get(key) || { id, name: name || String(id || ''), absentDays: 0 };
                prev.absentDays = (prev.absentDays || 0) + (Number(days) || 0);
                map.set(key, prev);
              };

              // Prefer per-student monthly stats if present
              if (Array.isArray(monthStats?.students) && monthStats.students.length > 0) {
                for (const s of monthStats.students) {
                  const id = s.studentId ?? s.id ?? (s.student && s.student.id) ?? null;
                  const name = s.name ?? s.student?.name ?? s.fullName ?? String(id ?? '');
                  // support multiple possible keys for absent-days
                  const days = s.absentDays ?? s.absences ?? s.absent ?? s.absenceDays ?? s.absenceCount ?? 0;
                  addToMap(id, name, days);
                }
              }

              // Also aggregate from raw monthRecords (attendance rows) to cover cases where per-student counts are missing
              if (Array.isArray(monthRecords) && monthRecords.length > 0) {
                for (const r of monthRecords) {
                  const id = r.studentId ?? (r.student && r.student.id) ?? null;
                  const name = (r.name ?? (r.student && r.student.name) ?? r.fullName ?? '') || String(id || '');
                  if (typeof r.absentDays === 'number') {
                    addToMap(id, name, r.absentDays);
                  } else if (r.isAbsent || r.isAbsent === true) {
                    addToMap(id, name, 1);
                  }
                }
              }

              const tops = Array.from(map.values());
              tops.sort((a, b) => (b.absentDays || 0) - (a.absentDays || 0));
              setTopStudents(tops.slice(0, 10));
            } catch {
              setTopStudents(null);
            }
          } catch {
            setMonthlySeries(null);
          }
        })();
      } catch {
        console.error('Failed to compute attendance stats');
        setAttendanceStats(null);
      }
      finally {
        setStatsLoading(false);
      }
    };
    compute();
  }, [classes, statsMonth, fetchAttendance, fetchStudents, classStudents, selectedClassId, fetchClassMonthlyStats, fetchNoAbsenceStudents, fetchBehaviorStats]);

  // Build pie data for a single selected stage (group = className) - absent vs present
  useEffect(() => {
    const loadStagePie = async () => {
      if (!statsMonth) {
        setStagePieData(null);
        return;
      }
      if (!Array.isArray(classes) || classes.length === 0) {
        setStagePieData(null);
        return;
      }
      // ensure we have a selectedStage; default to first unique className if not set
      const uniqueStages = Array.from(new Set(classes.map(c => (c.className || '').trim()).filter(Boolean)));
      if (!selectedStage && uniqueStages.length > 0) {
        setSelectedStage(uniqueStages[0]);
        // we'll run again due to state change
        return;
      }
      if (!selectedStage) {
        setStagePieData(null);
        return;
      }

      setStagePieLoading(true);
      try {
        const [year, mon] = (statsMonth || '').split('-').map((s) => Number(s));
        // collect ids for the chosen stage (className)
        const ids = classes.filter(c => (c.className || '').trim() === selectedStage).map(c => c.id);
        if (ids.length === 0) {
          setStagePieData(null);
          return;
        }
        const qs = ids.map(id => `classIds=${encodeURIComponent(id)}`).join('&');
        const url = `/Attendance/attendance-stats/classes?${qs}&year=${encodeURIComponent(year)}&month=${encodeURIComponent(mon)}`;
        const resp = await axios.get(url);
        const data = resp?.data ?? {};
        const absent = Number(data.absentCount ?? data.absents ?? data.absent ?? 0) || 0;
        const present = Number(data.presentCount ?? data.present ?? 0) || 0;
        const total = absent + present;
        const percentAbsent = total > 0 ? (absent / total) * 100 : 0;
        const percentPresent = 100 - percentAbsent;
        const pie = [
          { name: 'غائب', value: Number(percentAbsent.toFixed(2)), count: absent },
          { name: 'حاضر', value: Number(percentPresent.toFixed(2)), count: present }
        ];
        setStagePieData(pie);
      } catch (err) {
        console.error('Failed to load stage pie data', err);
        setStagePieData(null);
      } finally {
        setStagePieLoading(false);
      }
    };
    loadStagePie();
  }, [classes, statsMonth, selectedStage]);

  // School-wide absence percentage pie (غائب vs حاضر)
  useEffect(() => {
    const loadSchoolPie = async () => {
      if (!statsMonth) {
        setSchoolPieData(null);
        return;
      }
      setSchoolPieLoading(true);
      try {
        const [year, mon] = (statsMonth || '').split('-').map((s) => Number(s));
        // Use relative path so axios.defaults.baseURL is respected (avoids /api/api double)
        const url = `/Attendance/absence-percentage/school?year=${encodeURIComponent(year)}&month=${encodeURIComponent(mon)}`;
        const resp = await axios.get(url);
        const raw = Number(resp?.data?.absencePercentage ?? resp?.data?.absencePercent ?? resp?.data?.percent ?? 0) || 0;
        // Accept either 0..100 or 0..1 and normalize to percentage 0..100
        const percentAbsent = raw > 1 ? raw : raw * 100;
        const percentPresent = Math.max(0, 100 - percentAbsent);
        const pie = [
          { name: 'غائب', value: Number(percentAbsent.toFixed(2)), count: undefined },
          { name: 'حاضر', value: Number(percentPresent.toFixed(2)), count: undefined }
        ];
        setSchoolPieData(pie);
      } catch (err) {
        console.error('Failed to load school absence percentage', err);
        setSchoolPieData(null);
      } finally {
        setSchoolPieLoading(false);
      }
    };
    loadSchoolPie();
  }, [statsMonth]);

  // Class-level absence pie for a single selected class (uses same endpoint as stage but with single id)
  useEffect(() => {
    const loadClassPie = async () => {
      if (!statsMonth) {
        setClassPieData(null);
        return;
      }
      if (!selectedClassId) {
        setClassPieData(null);
        return;
      }
      setClassPieLoading(true);
      try {
        const [year, mon] = (statsMonth || '').split('-').map((s) => Number(s));
        const id = Number(selectedClassId);
        const url = `/Attendance/attendance-stats/classes?classIds=${encodeURIComponent(id)}&year=${encodeURIComponent(year)}&month=${encodeURIComponent(mon)}`;
        const resp = await axios.get(url);
        const data = resp?.data ?? {};
        // data may be { absentCount, presentCount }
        const absent = Number(data.absentCount ?? data.absents ?? data.absent ?? 0) || 0;
        const present = Number(data.presentCount ?? data.present ?? 0) || 0;
        const total = absent + present;
        const percentAbsent = total > 0 ? (absent / total) * 100 : 0;
        const percentPresent = 100 - percentAbsent;
        const pie = [
          { name: 'غائب', value: Number(percentAbsent.toFixed(2)), count: absent },
          { name: 'حاضر', value: Number(percentPresent.toFixed(2)), count: present }
        ];
        setClassPieData(pie);
      } catch (err) {
        console.error('Failed to load class absence pie', err);
        setClassPieData(null);
      } finally {
        setClassPieLoading(false);
      }
    };
    loadClassPie();
  }, [selectedClassId, statsMonth]);

  const filtered = useMemo(() => {
    const list = Array.isArray(reports) ? reports.slice() : [];
    return list.sort((a, b) => {
      const ta = new Date(a.generatedAt).getTime() || 0;
      const tb = new Date(b.generatedAt).getTime() || 0;
      return sortOrder === "asc" ? ta - tb : tb - ta;
    });
  }, [reports, sortOrder]);

  // pagination
  const totalPages = Math.max(1, Math.ceil((filtered || []).length / pageSize));
  // pagedReports removed because reports listing UI was removed per user request

  // summary removed

  // (handleView removed — not used anywhere)


  // export helpers removed

  // add-report removed

  const handleDownloadReport = (report) => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report_${report.id || 'report'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <TabsContent value="/reports" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>التقارير</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filters removed per request */}

          {/* Attendance stats panel */}
          <div className="border rounded p-4 mb-4 bg-white">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-3">
              <div className="flex flex-col md:flex-row items-start md:items-center gap-2 w-full">
                <div className="flex flex-col items-end w-full md:w-auto">
                  <Label className="text-right m-2">الفصل</Label>
                  <Select value={selectedClassId ?? "__none"} onValueChange={(v) => setSelectedClassId(v === "__none" ? null : v)}>
                    <SelectTrigger className="md:min-w-[10rem] w-full"><SelectValue placeholder="اختر فصلًا" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">اختر فصلًا</SelectItem>
                      {Array.isArray(classes) && classes.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {`${c.className || `الفصل ${c.id}`}${c.academicTerm ? ` · ${c.academicTerm}` : ''}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col items-end w-full md:w-auto">
                  <Label className="text-right m-2">الشهر</Label>
                  <Input type="month" value={statsMonth} onChange={(e) => setStatsMonth(e.target.value)} className="md:min-w-[10rem] w-full" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-3 border rounded text-center flex flex-col items-center justify-center">
                <div className="mb-2 text-gray-500"><UserX className="w-6 h-6 text-red-500 inline-block" /></div>
                <div className="text-sm text-gray-600">أكثر من 3 أيام غياب (شهري)</div>
                <div className="text-2xl font-bold">{statsLoading ? <span className="inline-block animate-spin">⏳</span> : (attendanceStats ? attendanceStats.count3 : '-')}</div>
              </div>
              <div className="p-3 border rounded text-center flex flex-col items-center justify-center">
                <div className="mb-2 text-gray-500"><UserX className="w-6 h-6 text-orange-500 inline-block" /></div>
                <div className="text-sm text-gray-600">أكثر من 5 أيام غياب (شهري)</div>
                <div className="text-2xl font-bold">{statsLoading ? <span className="inline-block animate-spin">⏳</span> : (attendanceStats ? attendanceStats.count5 : '-')}</div>
              </div>
              <div className="p-3 border rounded text-center flex flex-col items-center justify-center">
                <div className="mb-2 text-gray-500"><LucideCalendar className="w-6 h-6 text-indigo-500 inline-block" /></div>
                <div className="text-sm text-gray-600">أكثر من 10 أيام غياب (شهري)</div>
                <div className="text-2xl font-bold">{statsLoading ? <span className="inline-block animate-spin">⏳</span> : (attendanceStats ? attendanceStats.count10 : '-')}</div>
              </div>
              <div className="p-3 border rounded">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">الطالبات المنتظمات ({attendanceStats ? attendanceStats.regularStudents.length : '-'})</div>
                  <div className="text-gray-500"><UserCheck className="w-5 h-5 text-green-500" /></div>
                </div>
                <div className="mt-2 max-h-36 overflow-auto">
                  {statsLoading ? <div className="text-sm text-gray-500">جارٍ التحميل...</div> : (
                    attendanceStats ? (
                      attendanceStats.regularStudents.length === 0 ? <div className="text-sm text-gray-500">لا توجد</div> : (
                        <ul className="text-sm">
                          {attendanceStats.regularStudents.map((s) => <li key={s.id || s.name}>{s.name}</li>)}
                        </ul>
                      )
                    ) : <div className="text-sm text-gray-500">لا توجد بيانات</div>
                  )}
                </div>
              </div>
            </div>
          </div>

            {/* Absence by grade / stage pie chart (single stage) */}
            <div className="border rounded p-4 mb-4 bg-white">
              <div className="mb-3 font-semibold text-center">نسبة الغياب حسب المرحله (الشهر المحدد)</div>
              <div className="flex flex-col items-center gap-3">
                <div className="w-full md:w-1/3 text-right">
                  <Label className="text-right m-1">المرحله</Label>
                  <Select value={selectedStage ?? "__none"} onValueChange={(v) => setSelectedStage(v === "__none" ? null : v)}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="اختر المرحله" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">اختر صفًا</SelectItem>
                      {Array.from(new Set((classes || []).map(c => (c.className || '').trim()).filter(Boolean))).map((st) => (
                        <SelectItem key={st} value={st}>{st}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-center w-full">
                  {stagePieLoading ? (
                    <div className="text-sm text-gray-500">جارٍ تحميل بيانات الصف...</div>
                  ) : Array.isArray(stagePieData) && stagePieData.length > 0 ? (
                    <>
                    <div style={{ width: 520, maxWidth: '100%', height: 300, minWidth: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={stagePieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={isSmallScreen ? 60 : 100}
                            label={!isSmallScreen ? ({ name, value }) => `${name} ${value}%` : false}
                          >
                            {stagePieData.map((entry, idx) => (
                              <Cell key={`cell-${idx}`} fill={stagePalette[idx % stagePalette.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(val, name, props) => {
                            const p = props?.payload || {};
                            return [`${val}%`, `${p.name} (${p.count ?? ''})`];
                          }} />
                          {!isSmallScreen && (
                            <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ right: 0, top: '50%', transform: 'translateY(-50%)' }} />
                          )}
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    {isSmallScreen && Array.isArray(stagePieData) && (
                      <div className="mt-2 w-full text-sm">
                        <ul className="flex flex-row gap-3 justify-center flex-wrap">
                          {stagePieData.map((d, i) => (
                            <li key={d.name} className="flex items-center gap-2">
                              <span style={{ width: 12, height: 12, background: stagePalette[i % stagePalette.length], display: 'inline-block' }} />
                              <span>{d.name} — {d.value}%{d.count != null ? ` (${d.count})` : ''}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    </>
                  ) : (
                    <div className="text-sm text-gray-500">لا توجد بيانات لعرضها</div>
                  )}
                </div>
              </div>

              {/* School-wide absence pie */}
              <div className="border rounded p-4 mb-4 bg-white">
                <div className="mb-3 font-semibold text-center">نسبة الغياب - المدرسة (الشهر المحدد)</div>
                <div className="flex items-center justify-center">
                  {schoolPieLoading ? (
                    <div className="text-sm text-gray-500">جارٍ تحميل بيانات المدرسة...</div>
                  ) : Array.isArray(schoolPieData) && schoolPieData.length > 0 ? (
                    <>
                    <div style={{ width: 440, maxWidth: '100%', height: 260, minWidth: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={schoolPieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={isSmallScreen ? 60 : 80}
                            label={!isSmallScreen ? ({ name, value }) => `${name} ${value}%` : false}
                          >
                            {schoolPieData.map((entry, idx) => (
                              <Cell key={`cell-school-${idx}`} fill={schoolPalette[idx % schoolPalette.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(val) => `${val}%`} />
                          {!isSmallScreen && (
                            <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ right: 0, top: '50%', transform: 'translateY(-50%)' }} />
                          )}
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    {isSmallScreen && Array.isArray(schoolPieData) && (
                      <div className="mt-2 w-full text-sm">
                        <ul className="flex flex-row gap-3 justify-center flex-wrap">
                          {schoolPieData.map((d, i) => (
                            <li key={d.name} className="flex items-center gap-2">
                              <span style={{ width: 12, height: 12, background: schoolPalette[i % schoolPalette.length], display: 'inline-block' }} />
                              <span>{d.name} — {d.value}%{d.count != null ? ` (${d.count})` : ''}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    </>
                  ) : (
                    <div className="text-sm text-gray-500">لا توجد بيانات لعرضها</div>
                  )}
                </div>
              </div>

              {/* Class-level absence pie (single class) */}
              <div className="border rounded p-4 mb-4 bg-white">
                <div className="mb-3 font-semibold text-center">نسبة الغياب - الفصل المحدد (الشهر)</div>
                <div className="flex items-center justify-center">
                  {!selectedClassId ? (
                    <div className="text-sm text-gray-500">اختر فصلًا من الأعلى لعرض إحصائيات هذا الفصل</div>
                  ) : classPieLoading ? (
                    <div className="text-sm text-gray-500">جارٍ تحميل بيانات الفصل...</div>
                  ) : Array.isArray(classPieData) && classPieData.length > 0 ? (
                    <>
                    <div style={{ width: 440, maxWidth: '100%', height: 260, minWidth: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={classPieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={isSmallScreen ? 60 : 80}
                            label={!isSmallScreen ? ({ name, value }) => `${name} ${value}%` : false}
                          >
                            {classPieData.map((entry, idx) => (
                              <Cell key={`cell-class-${idx}`} fill={classPalette[idx % classPalette.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(val, name, props) => {
                            const p = props?.payload || {};
                            return [`${val}%`, `${p.name} (${p.count ?? ''})`];
                          }} />
                          {!isSmallScreen && (
                            <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ right: 0, top: '50%', transform: 'translateY(-50%)' }} />
                          )}
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    {isSmallScreen && Array.isArray(classPieData) && (
                      <div className="mt-2 w-full text-sm">
                        <ul className="flex flex-row gap-3 justify-center flex-wrap">
                          {classPieData.map((d, i) => (
                            <li key={d.name} className="flex items-center gap-2">
                              <span style={{ width: 12, height: 12, background: classPalette[i % classPalette.length], display: 'inline-block' }} />
                              <span>{d.name} — {d.value}%{d.count != null ? ` (${d.count})` : ''}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    </>
                  ) : (
                    <div className="text-sm text-gray-500">لا توجد بيانات لعرضها</div>
                  )}
                </div>
              </div>
            </div>

          {/* Unified charts removed per user request */}

          {/* Absence count lookup */}
          <div className="border rounded p-4 mb-4 bg-white">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">عدد أيام غياب طالب</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="flex flex-col items-end">
                <Label className="text-right m-2">الطالب</Label>
                <Select value={selectedStudentForCount ?? "__none"} onValueChange={(v) => setSelectedStudentForCount(v === "__none" ? null : v)} disabled={!selectedClassId}>
                  <SelectTrigger className="md:min-w-[10rem] w-full"><SelectValue placeholder="اختر طالبًا" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">اختر طالبًا</SelectItem>
                    {Array.isArray(classStudents) && classStudents.map((st) => (
                      <SelectItem key={st.id} value={String(st.id)}>{st.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col items-end">
                <Label className="text-right m-2">عدد أيام الغياب</Label>
                <div className="text-lg font-bold">
                  {countLoading ? (
                    '...'
                  ) : (
                    <div className="flex flex-col items-center">
                      <div className="text-sm">بعذر</div>
                      <div className="font-bold">{excusedCount != null ? excusedCount : '-'}</div>
                    </div>
                  )}
                </div>
              </div>
              <div className="p-0 flex flex-col items-end">
                <div className="text-lg font-bold">
                  {countLoading ? '...' : (
                    <div className="flex flex-col items-center">
                      <div className="text-sm">بدون عذر</div>
                      <div className="font-bold">{unexcusedCount != null ? unexcusedCount : '-'}</div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={async () => {
                  if (!selectedClassId) { toast.error('اختر فصلًا أولاً'); return; }
                  if (!selectedStudentForCount) { toast.error('اختر طالبًا أولًا'); return; }
                  try {
                    setCountLoading(true);
                    // default to start of current month until today
                    const now = new Date();
                    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
                    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
                    const startIso = start.toISOString().slice(0, 19);
                    const endIso = end.toISOString().slice(0, 19);
                    // fetch excused and unexcused counts in parallel
                    const [excusedRes, unexcusedRes] = await Promise.all([
                      fetchAbsenceCount(Number(selectedStudentForCount), startIso, endIso, true),
                      fetchAbsenceCount(Number(selectedStudentForCount), startIso, endIso, false),
                    ]);
                    setExcusedCount(excusedRes);
                    setUnexcusedCount(unexcusedRes);
                  } catch (err) {
                    console.error(err);
                    toast.error('فشل جلب عدد أيام الغياب');
                  } finally { setCountLoading(false); }
                }} disabled={!selectedStudentForCount || countLoading || !selectedClassId}>جلب</Button>
              </div>
            </div>
          </div>

          {/* Controls block removed as requested */}
          {/* Reports listing removed as requested */}

          {/* Pagination */}
          {filtered.length > 0 && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <Button variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>السابق</Button>
              <div className="text-sm">صفحة {page} من {totalPages}</div>
              <Button variant="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>التالي</Button>
            </div>
          )}

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-[900px] w-full">
              <DialogHeader>
                <DialogTitle>تفاصيل التقرير</DialogTitle>
              </DialogHeader>

              {!selectedReport ? (
                <div className="text-center py-8 text-gray-500">لا يوجد تقرير للعرض.</div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-lg font-semibold">{selectedReport.reportType || `تقرير ${selectedReport.id}`}</div>
                      <div className="text-sm text-gray-600">{selectedReport.generatedAt ? new Date(selectedReport.generatedAt).toLocaleString() : ''}</div>
                      <div className="text-sm text-gray-500 mt-1">{selectedReport.classId ? (classes.find(c => c.id === selectedReport.classId)?.className || `الفصل ${selectedReport.classId}`) : ''}</div>
                    </div>
                    <div className="text-right text-xs text-gray-400">ID: {selectedReport.id}</div>
                  </div>

                  <div className="border rounded p-3 bg-white">
                    {/* render reportData in a friendly way */}
                    {(() => {
                      const rd = selectedReport.reportData;
                      // if string, try parse
                      let parsed = rd;
                      if (typeof rd === 'string') {
                        try {
                          parsed = JSON.parse(rd);
                        } catch {
                          parsed = rd;
                        }
                      }

                      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
                        // render simple table
                        const keys = Array.from(new Set(parsed.flatMap(o => Object.keys(o))));
                        return (
                          <div className="overflow-auto">
                            <table className="w-full text-sm table-auto border-collapse">
                              <thead>
                                <tr>
                                  {keys.map(k => <th key={k} className="text-left font-medium border-b p-2">{k}</th>)}
                                </tr>
                              </thead>
                              <tbody>
                                {parsed.map((row, idx) => (
                                  <tr key={idx} className="even:bg-gray-50">
                                    {keys.map(k => <td key={k} className="p-2 align-top">{String(row[k] ?? '')}</td>)}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      }

                      if (parsed && typeof parsed === 'object') {
                        // key/value list
                        return (
                          <div className="grid grid-cols-1 gap-2">
                            {Object.keys(parsed).map((k) => (
                              <div key={k} className="flex gap-2">
                                <div className="font-medium text-sm text-gray-700 w-40">{k}</div>
                                <div className="text-sm text-gray-700 break-words">{typeof parsed[k] === 'object' ? JSON.stringify(parsed[k]) : String(parsed[k])}</div>
                              </div>
                            ))}
                          </div>
                        );
                      }

                      // fallback: show as text
                      return <div className="whitespace-pre-wrap text-sm text-gray-800">{String(parsed ?? '')}</div>;
                    })()}
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setShowRaw(s => !s)}>{showRaw ? 'إخفاء JSON' : 'عرض JSON'}</Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDownloadReport(selectedReport)}>تحميل JSON</Button>
                    <Button size="sm" variant="primary" onClick={() => setOpen(false)}>إغلاق</Button>
                  </div>

                  {showRaw && (
                    <pre className="whitespace-pre-wrap max-h-[50vh] overflow-auto border rounded p-2 bg-gray-50">{JSON.stringify(selectedReport, null, 2)}</pre>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>
          
        </CardContent>
      </Card>
    </TabsContent>
  );
}

export default Reports;
