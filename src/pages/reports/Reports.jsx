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
import { useClass } from "@/contexts/ClassContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

function Reports() {
  const { reports, fetchReports, fetchReportById, exportReports, loading } = useReportsContext();
  const { addReport } = useReportsContext();
  const { fetchAttendance } = useAttendance();
  const { fetchStudents } = useStudent();
  const { classes } = useClass();
  const [filterClass, setFilterClass] = useState(null);
  const [statsPeriodType, setStatsPeriodType] = useState('monthly'); // 'monthly' | 'quarterly'
  const [statsMonth, setStatsMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
  });
  const [attendanceStats, setAttendanceStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [reportTypeFilter, setReportTypeFilter] = useState(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedReport, setSelectedReport] = useState(null);
  const [open, setOpen] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // compute attendance stats when class or period changes
  useEffect(() => {
    const compute = async () => {
      if (!filterClass) {
        setAttendanceStats(null);
        return;
      }
      try {
        setStatsLoading(true);
        // fetch roster
        const students = await fetchStudents(Number(filterClass));
        const roster = Array.isArray(students) ? students : students ? [students] : [];

        // helper to fetch attendance for a month key 'YYYY-MM'
        const fetchForMonth = async (monthKey) => {
          try {
            const data = await fetchAttendance(Number(filterClass), monthKey);
            return Array.isArray(data) ? data : data ? [data] : [];
          } catch (e) {
            return [];
          }
        };

        const [year, mon] = (statsMonth || '').split('-').map((s) => Number(s));
        const monthKey = statsMonth; // YYYY-MM

        // monthly attendance
        const monthRecords = await fetchForMonth(monthKey);

        // quarterly: take month and previous two months
        const quarterMonths = [];
        if (statsPeriodType === 'quarterly') {
          for (let i = 0; i < 3; i++) {
            const m = mon - i;
            let y = year;
            let mm = m;
            if (m <= 0) {
              mm = 12 + m;
              y = year - 1;
            }
            quarterMonths.push(`${y}-${String(mm).padStart(2, '0')}`);
          }
        } else {
          quarterMonths.push(monthKey);
        }

        // fetch quarter months attendance in parallel
        const quarterPromises = quarterMonths.map((mk) => fetchForMonth(mk));
        const quarterResults = await Promise.all(quarterPromises);
        const quarterRecords = quarterResults.flat();

        // build absence counts per student in month and quarter
        const absenceCountMonth = new Map();
        const absenceCountQuarter = new Map();

        const accumulate = (recList, map) => {
          for (const r of recList) {
            try {
              const sid = r.studentId ?? (r.student && r.student.id) ?? null;
              const name = (r.name ?? (r.student && r.student.name) ?? '').trim();
              const key = sid != null ? String(sid) : `name:${name}`;
              if (r.isAbsent || r.isAbsent === true) {
                map.set(key, (map.get(key) || 0) + 1);
              }
            } catch (e) {
              // ignore malformed record
            }
          }
        };

        accumulate(monthRecords, absenceCountMonth);
        accumulate(quarterRecords, absenceCountQuarter);

        // compute metrics
        const count3 = roster.filter((s) => {
          const key = s.id != null ? String(s.id) : `name:${(s.name||'').trim()}`;
          return (absenceCountMonth.get(key) || 0) >= 3;
        }).length;

        const count5 = roster.filter((s) => {
          const key = s.id != null ? String(s.id) : `name:${(s.name||'').trim()}`;
          return (absenceCountMonth.get(key) || 0) >= 5;
        }).length;

        const count10 = roster.filter((s) => {
          const key = s.id != null ? String(s.id) : `name:${(s.name||'').trim()}`;
          return (absenceCountQuarter.get(key) || 0) >= 10;
        }).length;

        const regularStudents = roster.filter((s) => {
          const key = s.id != null ? String(s.id) : `name:${(s.name||'').trim()}`;
          return (absenceCountQuarter.get(key) || 0) === 0;
        }).map((s) => ({ id: s.id, name: s.name }));

        setAttendanceStats({ count3, count5, count10, regularStudents, rosterLength: roster.length });
      } catch (err) {
        console.error('Failed to compute attendance stats', err);
        setAttendanceStats(null);
      }
      finally {
        setStatsLoading(false);
      }
    };
    compute();
  }, [filterClass, statsMonth, statsPeriodType, fetchAttendance, fetchStudents]);

  const filtered = useMemo(() => {
    const list = Array.isArray(reports) ? reports.slice() : [];
    const term = (searchTerm || "").trim().toLowerCase();
    return list.filter((r) => {
      if (filterClass && r.classId !== Number(filterClass)) return false;
      if (reportTypeFilter && String(r.reportType) !== String(reportTypeFilter)) return false;
      if (fromDate && new Date(r.generatedAt) < new Date(fromDate)) return false;
      if (toDate && new Date(r.generatedAt) > new Date(toDate)) return false;
      if (term) {
        const joined = `${r.reportType || ""} ${r.id || ""} ${r.classId || ""} ${JSON.stringify(r)}`.toLowerCase();
        if (!joined.includes(term)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const ta = new Date(a.generatedAt).getTime() || 0;
      const tb = new Date(b.generatedAt).getTime() || 0;
      return sortOrder === "asc" ? ta - tb : tb - ta;
    });
  }, [reports, filterClass, reportTypeFilter, fromDate, toDate, searchTerm, sortOrder]);

  // pagination
  const totalPages = Math.max(1, Math.ceil((filtered || []).length / pageSize));
  const pagedReports = useMemo(() => {
    const start = (page - 1) * pageSize;
    return (filtered || []).slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const summary = useMemo(() => {
    const total = filtered.length;
    const byType = {};
    for (const r of filtered) {
      const t = r.reportType || "عام";
      byType[t] = (byType[t] || 0) + 1;
    }
    return { total, byType };
  }, [filtered]);

  const handleView = async (id) => {
    try {
      const data = await fetchReportById(id);
      setSelectedReport(data);
      setShowRaw(false);
      setOpen(true);
    } catch (err) {
      console.error(err);
    }
  };

  const handleExport = async () => {
    // Export the currently filtered reports as JSON
    try {
      const data = filtered;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reports_export_${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  const jsonToCsv = (arr) => {
    if (!Array.isArray(arr) || arr.length === 0) return "";
    const keys = Array.from(new Set(arr.flatMap((o) => Object.keys(o))));
    const rows = arr.map((o) => keys.map((k) => {
      const v = o[k] == null ? "" : String(o[k]);
      return `"${v.replace(/"/g, '""')}"`;
    }).join(","));
    return [keys.join(","), ...rows].join("\n");
  };

  const handleExportCSV = () => {
    try {
      const csv = jsonToCsv(filtered);
      if (!csv) {
        toast.error('لا يوجد بيانات لتصدير');
        return;
      }
      // Prepend UTF-8 BOM so Excel opens the file with correct encoding for Arabic
      const bom = "\uFEFF";
      const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reports_export_${new Date().toISOString()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  // Add report modal state
  const [addOpen, setAddOpen] = useState(false);
  const [newType, setNewType] = useState("");
  const [newContent, setNewContent] = useState("");
  const [adding, setAdding] = useState(false);
  const [useCustomType, setUseCustomType] = useState(false);
  const MAX_CONTENT = 4000;

  const handleAddReport = async (e) => {
    e && e.preventDefault();
    if (!newType || !newContent) {
      toast.error("الرجاء ملء نوع التقرير والمحتوى");
      return;
    }
    // server expects { id, reportType, generatedAt, reportData }
  const reportDataPayload = newContent;
    const payload = {
      id: 0,
      reportType: newType,
      generatedAt: new Date().toISOString(),
      reportData: reportDataPayload,
    };
    try {
      setAdding(true);
      const created = await addReport(payload);
      toast.success("تم إنشاء التقرير");
      fetchReports();
      setAddOpen(false);
  setNewType("");
      setNewContent("");
    } catch (err) {
      console.error(err);
      toast.error("فشل إنشاء التقرير");
    } finally {
      setAdding(false);
    }
  };

  const presetTypes = useMemo(() => {
  const fromReports = Array.from(new Set((reports || []).map(r => r.reportType).filter(Boolean))).slice(0, 8);
  // filter out obviously invalid placeholder values like 'string'
  const cleaned = fromReports.filter(t => typeof t === 'string' && t.trim() && !/^string$/i.test(t));
  const defaults = ["سلوك", "غياب", "تحذير"];
    // merge defaults + discovered types, keeping order and uniqueness
    const merged = [...defaults, ...fromReports].filter((v, i, a) => v && a.indexOf(v) === i);
    return merged;
  }, [reports]);

  const contentLen = (newContent || "").length;
  const typeValid = Boolean(newType && newType.trim());
  const contentValid = contentLen > 5 && contentLen <= MAX_CONTENT;
  const canSubmit = typeValid && contentValid && !adding;

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
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4">
            <div className="md:col-span-2 flex flex-col items-end">
              <Label className="text-right m-2">بحث</Label>
              <Input className="w-full" placeholder="ابحث باسم، نوع، أو نص" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }} />
            </div>
            <div className="flex flex-col items-end">
              <Label className="text-right m-2">الفصل</Label>
              <Select value={filterClass ?? "__all"} onValueChange={(v) => { setFilterClass(v === "__all" ? null : v); setPage(1); }}>
                <SelectTrigger className="md:min-w-[10rem] w-full"><SelectValue placeholder="الكل" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">الكل</SelectItem>
                  {Array.isArray(classes) && classes.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.className}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col items-end">
              <Label className="text-right m-2">نوع التقرير</Label>
              <Select value={reportTypeFilter ?? "__all"} onValueChange={(v) => { setReportTypeFilter(v === "__all" ? null : v); setPage(1); }}>
                <SelectTrigger className="md:min-w-[10rem] w-full"><SelectValue placeholder="الكل" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">الكل</SelectItem>
                  {presetTypes.filter(t => typeof t === 'string' && t.trim() && !/^[0-9]+$/.test(t) && t.length > 1).map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col items-end">
              <Label className="text-right m-2">من</Label>
              <Input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} />
            </div>
            <div className="flex flex-col items-end">
              <Label className="text-right m-2">إلى</Label>
              <Input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} />
            </div>
          </div>

          {/* Attendance stats panel */}
          <div className="border rounded p-4 mb-4 bg-white">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">غياب و انتظام</div>
              <div className="flex items-center gap-2">
                <Select value={statsPeriodType} onValueChange={(v) => setStatsPeriodType(v)}>
                  <SelectTrigger className="md:min-w-[10rem] w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">شهري</SelectItem>
                    <SelectItem value="quarterly">فصلي</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="month" value={statsMonth} onChange={(e) => setStatsMonth(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-3 border rounded text-center flex flex-col items-center justify-center">
                <div className="mb-2 text-gray-500"><UserX className="w-6 h-6 text-red-500 inline-block" /></div>
                <div className="text-sm text-gray-600">غياب 3 أيام (شهري)</div>
                <div className="text-2xl font-bold">{statsLoading ? <span className="inline-block animate-spin">⏳</span> : (attendanceStats ? attendanceStats.count3 : '-')}</div>
              </div>
              <div className="p-3 border rounded text-center flex flex-col items-center justify-center">
                <div className="mb-2 text-gray-500"><UserX className="w-6 h-6 text-orange-500 inline-block" /></div>
                <div className="text-sm text-gray-600">غياب 5 أيام (شهري)</div>
                <div className="text-2xl font-bold">{statsLoading ? <span className="inline-block animate-spin">⏳</span> : (attendanceStats ? attendanceStats.count5 : '-')}</div>
              </div>
              <div className="p-3 border rounded text-center flex flex-col items-center justify-center">
                <div className="mb-2 text-gray-500"><LucideCalendar className="w-6 h-6 text-indigo-500 inline-block" /></div>
                <div className="text-sm text-gray-600">غياب 10 أيام (فصلي)</div>
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

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">العرض: <span className="font-semibold">{summary.total}</span> تقرير</div>
              <div className="text-sm text-gray-500">{(() => {
                const isValid = (k) => typeof k === 'string' && k.trim() && !/^string$/i.test(k) && !/^[0-9]+$/.test(k) && k.length > 1;
                const entries = Object.keys(summary.byType || {}).filter(isValid).map((t) => `${t}: ${summary.byType[t]}`);
                return entries.length ? entries.join(' · ') : null;
              })()}</div>
            </div>
            <div className="flex flex-wrap gap-2 items-center justify-end btn-group">
              <div className="flex flex-col items-end">
                <Label className="text-right hidden md:block m-2">ترتيب</Label>
                <Select value={sortOrder} onValueChange={(v) => setSortOrder(v)}>
                  <SelectTrigger className="md:min-w-[9rem] w-full md:w-40"><SelectValue placeholder="ترتيب" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">الأحدث أولاً</SelectItem>
                    <SelectItem value="asc">الأقدم أولاً</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col items-end">
                <Label className="text-right hidden md:block m-2">حجم الصفحة</Label>
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                  <SelectTrigger className="md:min-w-[6rem] w-full md:w-28"><SelectValue placeholder="حجم الصفحة" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col items-end">
                  <Label className="text-right hidden md:block m-2">تصدير</Label>
                  <div className="flex flex-col sm:flex-row gap-2 items-stretch w-full">
                    <Button className="whitespace-nowrap btn-responsive-full" onClick={handleExport} disabled={loading} variant="primary" size="lg">تصدير JSON</Button>
                    <Button className="whitespace-nowrap btn-responsive-full" onClick={handleExportCSV} disabled={loading} variant="primary" size="lg">تصدير CSV</Button>
                    {/* Add Report trigger */}
                    <Dialog open={addOpen} onOpenChange={setAddOpen}>
                      <DialogTrigger asChild>
                        <Button className="whitespace-nowrap btn-responsive-full" variant="primary" size="lg">إضافة تقرير</Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[720px] w-full">
                        <DialogHeader>
                          <DialogTitle>إضافة تقرير جديد</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleAddReport} className="space-y-4">
                          <div className="flex flex-col items-end">
                              <Label className="text-right m-2">نوع التقرير</Label>
                              <div className="flex gap-2 w-full items-center">
                                <Select value={useCustomType ? "__other" : (newType || "__none")} onValueChange={(v) => {
                                  if (v === "__other") {
                                    setUseCustomType(true);
                                    setNewType("");
                                  } else if (v === "__none") {
                                    setUseCustomType(false);
                                    setNewType("");
                                  } else {
                                    setUseCustomType(false);
                                    setNewType(v);
                                  }
                                }}>
                                  <SelectTrigger className="md:min-w-[10rem] w-full"><SelectValue placeholder="اختر نوعًا" /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none">اختر من القائمة</SelectItem>
                                    {presetTypes.map((t) => (
                                      <SelectItem key={t} value={t}>{t}</SelectItem>
                                    ))}
                                    <SelectItem value="__other">آخر...</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              {useCustomType && (
                                <Input className="mt-2 w-full" value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="اكتب نوعًا مخصصًا" />
                              )}
                              {!typeValid && <div className="text-xs text-red-500 mt-1">الرجاء تحديد أو كتابة نوع التقرير</div>}
                            </div>
                          {/* optional class removed */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex flex-col items-end">
                              <Label className="text-right m-2">المحتوى</Label>
                              <textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder="نص التقرير أو ملخص" className="w-full min-h-[120px] p-2 border rounded" maxLength={MAX_CONTENT} />
                              <div className="w-full flex justify-between text-xs text-gray-500 mt-1">
                                <div>{contentLen} / {MAX_CONTENT} أحرف</div>
                                <div className={`text-xs ${contentValid ? 'text-green-600' : 'text-red-500'}`}>{contentValid ? 'مناسب' : 'قصير جداً أو طويل'}</div>
                              </div>
                            </div>
                            <div className="flex flex-col items-end">
                              <Label className="text-right m-2">معاينة التقرير</Label>
                              <div className="w-full border rounded p-3 bg-gray-50 min-h-[120px] overflow-auto">
                                <div className="font-semibold mb-1">{newType || 'نوع غير محدد'}</div>
                                <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">{newContent || 'لا يوجد محتوى بعد'}</div>
                              </div>
                            </div>
                          </div>
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>إلغاء</Button>
                          <Button type="submit" disabled={!canSubmit} variant="primary">{adding ? 'جارٍ...' : 'إنشاء'}</Button>
                        </div>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
            </div>
          </div>
          <div className="space-y-3">
            {loading ? (
              <div className="text-center py-8 text-gray-500">جاري تحميل التقارير...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-gray-500">لا توجد تقارير للمعايير المحددة.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pagedReports.map((r) => (
                  <div key={r.id} className="border rounded-lg p-4 bg-white shadow-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-semibold text-base">{r.reportType || `تقرير ${r.id}`}</div>
                        <div className="text-sm text-gray-600">{new Date(r.generatedAt).toLocaleString()}</div>
                        <div className="text-sm text-gray-500 mt-1">{r.classId ? (classes.find(c => c.id === r.classId)?.className || `الفصل ${r.classId}`) : ''}</div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                          <div className="text-xs text-gray-400">ID: {r.id}</div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleDownloadReport(r)}>تحميل</Button>
                          </div>
                        </div>
                    </div>
                    <div className="mt-3 text-sm text-gray-700 max-h-28 overflow-auto">
                      <pre className="whitespace-pre-wrap">{(() => {
                        const rd = r.reportData;
                        if (typeof rd === 'string') {
                          // try to parse JSON stored string
                          try {
                            const parsed = JSON.parse(rd);
                            return JSON.stringify(parsed, null, 2).slice(0, 800);
                          } catch (e) {
                            return rd.slice(0, 800);
                          }
                        }
                        return JSON.stringify(rd || {}, null, 2).slice(0, 800);
                      })()}</pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

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
                        } catch (e) {
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
