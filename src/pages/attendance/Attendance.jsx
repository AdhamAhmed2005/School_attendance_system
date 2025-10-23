import { useEffect, useState, useCallback, memo } from "react";
import { useAttendance } from "@/contexts/AttendanceContext";
import { useStudent } from "@/contexts/StudentContext";
import { useClass } from "@/contexts/ClassContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, AlertCircle, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

// Memoized row to avoid full-table re-renders. Re-renders only when student props or saving state change.
const StudentRow = memo(function StudentRow({ student, index, onDelete, onToggle, saving }) {
  const idKey = student.studentId ?? `${student.name}-${index}`;
  return (
    <TableRow key={idKey}>
      <TableCell className="text-center">
        <div className="flex items-center justify-center">
          <Button
            variant="ghost"
            size="icon"
            disabled={!student.studentId || !!saving}
            onClick={() => onDelete(student)}
          >
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>
        </div>
      </TableCell>

      <TableCell className="flex flex-row-reverse items-center justify-center gap-4">
        <Switch
          checked={!student.isAbsent}
          onCheckedChange={(checked) => onToggle(student, checked)}
          disabled={!!saving}
          className={`rotate-180 ${student.isAbsent ? 'bg-red-100/80' : 'bg-green-100/80'}`}
        />
        <div className="flex items-center gap-2">
          <span className={`${student.isAbsent ? 'text-red-500' : 'text-green-700'} font-bold`}>
            {student.isAbsent ? 'غائب' : 'حاضر'}
          </span>
          {saving && <Loader2 className="animate-spin h-4 w-4 text-gray-400" />}
        </div>
      </TableCell>

      {/* Excused column removed as requested */}

      <TableCell className="text-right">
        <div className="flex flex-col items-end">
          <span>{student.name}</span>
        </div>
      </TableCell>
      <TableCell className="text-right hidden sm:table-cell">
        <div className="hidden sm:flex items-center justify-end gap-2">
          <span>{student.rollNumber ?? index + 1}</span>
        </div>
      </TableCell>
    </TableRow>
  );
}, (prevProps, nextProps) => {
  // Only re-render when the student absent/excused state or saving state changes
  return (
    prevProps.student.studentId === nextProps.student.studentId &&
    prevProps.student.isAbsent === nextProps.student.isAbsent &&
    prevProps.student.isExcused === nextProps.student.isExcused &&
    prevProps.saving === nextProps.saving
  );
});

function Attendance() {
  const { fetchClassAttendanceByDate, addAttendance, loading, attendanceNotFound } = useAttendance();
  const { selectedClass, selectedDate, updateClass, setSelectedClass } = useClass();
  const { fetchStudents, deleteStudent } = useStudent();
  const [attendanceData, setAttendanceData] = useState([]);
  // allPresent state removed (not used)
  const [savingIds, setSavingIds] = useState(new Set());
  const [, setDirtyKeys] = useState(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  // dialog state when marking a student absent: prompt whether absence has a reason (excused)
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [reasonTarget, setReasonTarget] = useState(null);
  const [reasonExcused, setReasonExcused] = useState(false);

  const loadAttendance = useCallback(async () => {
    try {
      if (!selectedClass?.id) {
        setAttendanceData([]);
        return;
      }

      // Always fetch the class roster first so every student appears in the UI by default.
      let rosterList = [];
      try {
        const roster = await fetchStudents(selectedClass.id);
        rosterList = Array.isArray(roster) ? roster : roster ? [roster] : [];
      } catch (rosterErr) {
        console.error("Error fetching roster:", rosterErr);
        // if roster fails, we'll fall back to attendance list below
        rosterList = [];
      }

      // API expects date in YYYY-MM-DD format (not full DateTime). Use a local date key to avoid timezone shifts.
      const toDateKey = (d) => {
        try {
          const dt = d ? new Date(d) : new Date();
          const yyyy = dt.getFullYear();
          const mm = String(dt.getMonth() + 1).padStart(2, "0");
          const dd = String(dt.getDate()).padStart(2, "0");
          return `${yyyy}-${mm}-${dd}`;
        } catch {
          return new Date(d).toISOString().slice(0, 10);
        }
      };

      const dateParam = toDateKey(selectedDate);
      const attendance = await fetchClassAttendanceByDate(selectedClass.id, dateParam);

      // Normalize attendance records into a simple map by studentId (or name)
      const list = Array.isArray(attendance) ? attendance : attendance ? [attendance] : [];
      const normalized = list
        .map((a) => {
          const studentId = a.studentId ?? a.student?.id ?? a.student?.studentId ?? a.id ?? null;
          const rawName = a.name ?? a.student?.name ?? a.studentName ?? a.student?.fullName ?? "";
          const name = String(rawName).trim().replace(/\s+/g, " ");
          const rollNumber = a.rollNumber ?? a.student?.rollNumber ?? null;
          const isAbsent = typeof a.isAbsent === "boolean" ? a.isAbsent : !!a.absent;
          const isExcused = typeof a.isExcused === "boolean" ? a.isExcused : !!a.excused;
          return { ...a, studentId, name, rollNumber, isAbsent, isExcused };
        })
        .filter((n) => (n.studentId !== null) || (n.name && n.name.length > 0));

      const attendanceMap = new Map();
      for (const n of normalized) {
        const key = n.studentId != null ? String(n.studentId) : n.name;
        attendanceMap.set(key, { studentId: n.studentId, name: n.name, rollNumber: n.rollNumber, isAbsent: n.isAbsent, isExcused: n.isExcused, id: n.id });
      }

      // If we have a roster, build rows from it and merge any attendance flags; otherwise use attendance list
      if (rosterList.length > 0) {
        const merged = rosterList.map((s, idx) => {
          const key = String(s.id ?? s.studentId ?? s.name);
          const match = attendanceMap.get(key);
          return {
            studentId: s.id ?? s.studentId,
            name: s.name ?? s.fullName ?? s.studentName,
            rollNumber: s.rollNumber ?? s.roll ?? (idx + 1),
            isAbsent: !!(match && match.isAbsent),
            isExcused: !!(match && (typeof match.isExcused === 'boolean' ? match.isExcused : !!match.excused)),
            id: match?.id,
          };
        });
        // show roster (every student) and merge attendance flags
        // remove any rows that lack a valid studentId so they don't persist in-memory or appear in exports
        const filteredMerged = merged.filter((p) => p.studentId != null && String(p.studentId).trim() !== "" && String(p.studentId).trim() !== "0");
        setAttendanceData(filteredMerged);
      } else {
        // no roster available; fall back to attendance items (may be partial)
  const deduped = Array.from(new Map(normalized.map((n) => [n.studentId != null ? String(n.studentId) : n.name, n])).values()).map((n) => ({
    studentId: n.studentId,
    name: n.name,
    rollNumber: n.rollNumber,
    isAbsent: n.isAbsent,
    isExcused: typeof n.isExcused === 'boolean' ? n.isExcused : !!n.excused,
    id: n.id,
  }));
        // filter out rows without a valid studentId
        const filteredDeduped = deduped.filter((p) => p.studentId != null && String(p.studentId).trim() !== "" && String(p.studentId).trim() !== "0");
        setAttendanceData(filteredDeduped);
      }
    } catch (error) {
      console.error("Error loading attendance:", error);
      setAttendanceData([]);
      toast.error("حدث خطأ أثناء جلب بيانات الحضور، حاول مرة أخرى");
    }
  }, [selectedClass, selectedDate, fetchClassAttendanceByDate, fetchStudents]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  // student: row object; checked: (optional) new checked state from Switch (true == present)
  // Toggle only updates UI and marks the row dirty. Saving is done by the Save button which will persist one-by-one.
  const handleToggle = useCallback((student, checked) => {
    const key = String(student.studentId ?? student.name ?? "unknown");
    // determine new isAbsent value (checked=true means present)
    const newIsAbsent = typeof checked === "boolean" ? !checked : !student.isAbsent;

    // If toggling to absent, prompt the user whether the absence has a reason (excused).
    // We do not optimistically flip UI here because the Switch's checked prop is derived from state.
    if (newIsAbsent) {
      setReasonTarget(student);
      setReasonExcused(!!student.isExcused);
      setReasonDialogOpen(true);
      return;
    }

    // toggling back to present: update UI and mark dirty so Save will persist later
    setAttendanceData((prev) => prev.map((item) => (String(item.studentId ?? item.name ?? "") === String(student.studentId ?? student.name ?? "") ? { ...item, isAbsent: newIsAbsent } : item)));

    setDirtyKeys((s) => {
      const copy = new Set(s);
      copy.add(key);
      return copy;
    });
  }, [setAttendanceData, setDirtyKeys]);

  // Confirm reason dialog: save the absence state (+excused flag) for the targeted student
  const handleReasonSave = useCallback(() => {
    if (!reasonTarget) {
      setReasonDialogOpen(false);
      setReasonTarget(null);
      return;
    }
    const student = reasonTarget;
    const key = String(student.studentId ?? student.name ?? "unknown");
    setAttendanceData((prev) => prev.map((item) => (String(item.studentId ?? item.name ?? "") === String(student.studentId ?? student.name ?? "") ? { ...item, isAbsent: true, isExcused: !!reasonExcused } : item)));
    setDirtyKeys((s) => {
      const copy = new Set(s);
      copy.add(key);
      return copy;
    });
    setReasonDialogOpen(false);
    setReasonTarget(null);
  }, [reasonTarget, reasonExcused]);

  const handleReasonCancel = useCallback(() => {
    // just close the dialog and leave the student's state unchanged
    setReasonDialogOpen(false);
    setReasonTarget(null);
  }, []);

  // Per-row excused handlers removed when excused column was removed from the table

  // Excused per-row auto-save removed because excused column was removed from the table

  const handleSave = async () => {
    // Save all rows as a single batch array via addAttendance
    if (!selectedClass?.id) {
      toast.error("الرجاء اختيار فصل دراسي أولاً");
      return;
    }

    const isoDate = selectedDate.toISOString();
    const rows = Array.isArray(attendanceData) ? attendanceData : [];

    // Build payload: send all rows at once (filtered to valid studentId). This ensures the
    // backend receives a single array containing each student's attendance state as requested.
    const rawPayloadRows = rows.map((r) => {
      return {
        id: typeof r.id !== 'undefined' && r.id !== null ? r.id : 0,
        studentId: r.studentId,
        classId: selectedClass.id,
        date: isoDate,
        isAbsent: !!r.isAbsent,
        isExcused: !!r.isExcused,
      };
    });

    const payloadRows = rawPayloadRows
      .map((p) => ({ ...p, studentId: (p.studentId != null && String(p.studentId).trim() !== "") ? (isNaN(Number(p.studentId)) ? p.studentId : Number(p.studentId)) : null }))
      .filter((p) => p.studentId != null && String(p.studentId).trim() !== "0");
    const skipped = rawPayloadRows.filter((p) => p.studentId == null);

    if (payloadRows.length === 0) {
      if (skipped.length > 0) {
        toast.error(`تجاهلت ${skipped.length} صفًا لأنها لا تحتوي على معرف طالب. أضف/حرر الطالب أولاً في صفحة الطلاب.`);
      } else {
        toast.info("لا توجد تغييرات للحفظ");
      }
      return;
    }

    try {
      // Show a single saving indicator by temporarily setting savingIds to 'all'
      setSavingIds(new Set(["__ALL__"]));
      // diagnostic: record outgoing payload for debugging
      try {
        if (!window.__attendanceLastRequests) window.__attendanceLastRequests = [];
        window.__attendanceLastRequests.unshift({ ts: Date.now(), phase: 'OUTGOING_BATCH_SAVE', payload: payloadRows });
        if (window.__attendanceLastRequests.length > 200) window.__attendanceLastRequests.length = 200;
  } catch (logErr) { console.warn('diag push failed', logErr); }
      const res = await addAttendance(payloadRows);

      // diagnostic: record server response when available
      try {
        if (!window.__attendanceLastRequests) window.__attendanceLastRequests = [];
        window.__attendanceLastRequests.unshift({ ts: Date.now(), phase: 'BATCH_SAVE_RESPONSE', response: res });
        if (window.__attendanceLastRequests.length > 200) window.__attendanceLastRequests.length = 200;
  } catch (logErr) { console.warn('diag push failed', logErr); }

      // If some rows were skipped because they lacked studentId, inform the user
      if (skipped.length > 0) {
        toast.warn(`تجاهلت ${skipped.length} صفًا بدون معرف طالب. راجع قائمة الطلاب لإضافتهم.`);
      }

      // Merge returned records into local attendanceData when possible to avoid reloading
      const returned = Array.isArray(res) ? res : res ? [res] : [];
      if (returned.length > 0) {
        setAttendanceData((prev) => {
          const map = new Map(prev.map((r) => [String(r.studentId ?? r.name ?? Math.random()), r]));
          for (const u of returned) {
            try {
              const key = String(u.studentId ?? u.student?.id ?? u.name ?? u.id);
              const existing = map.get(key) || {};
              map.set(key, {
                studentId: u.studentId ?? existing.studentId,
                name: existing.name ?? u.name ?? existing.name,


                rollNumber: existing.rollNumber ?? u.rollNumber,
                isAbsent: typeof u.isAbsent === "boolean" ? u.isAbsent : !!u.absent,
                isExcused: typeof u.isExcused === "boolean" ? u.isExcused : !!u.excused,
                id: u.id ?? existing.id,
              });
            } catch {
              // ignore merge errors for a single record
            }
          }
          // ensure we don't re-introduce rows without valid studentId
          return Array.from(map.values()).filter((r) => r.studentId != null && String(r.studentId).trim() !== "" && String(r.studentId).trim() !== "0");
        });
      } else {
        // If backend did not return records, fall back to reloading to be safe
        await loadAttendance();
      }
      setDirtyKeys(new Set());
      toast.success("تم حفظ الحضور والغياب بنجاح");
    } catch (err) {
      console.error("Batch save failed:", err);
      const msg = err?.response?.data?.message || err?.message || "فشل الحفظ";
      toast.error(msg);
    } finally {
      setSavingIds(new Set());
    }
  };

  
  
  const handleToggleAll = (present) => {
    setAttendanceData((prev) => prev.map((p) => ({ ...p, isAbsent: !present })));
  };
  
  const handleExportCSV = () => {
    const exportList = Array.isArray(attendanceData) ? attendanceData : [];
    const dedupedExport = Array.from(new Map(exportList.map((a) => [a.studentId, a])).values())
      .filter((r) => r.studentId != null && String(r.studentId).trim() !== "" && String(r.studentId).trim() !== "0");
    if (!dedupedExport || dedupedExport.length === 0) {
      toast.error("لا يوجد بيانات لتصدير");
      return;
    }
  
    const headers = ["name", "rollNumber", "date", "isAbsent"];
  const dateStr = selectedDate.toISOString();
  const rows = dedupedExport.map((r, idx) => [r.name || "", r.rollNumber || idx + 1, dateStr, r.isAbsent]);
  
  const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
  // Prepend UTF-8 BOM so Excel (Windows) recognizes UTF-8 and displays Arabic correctly
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_${selectedClass?.className || selectedClass?.id}_${selectedDate.toLocaleDateString("en-CA")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardContent className="space-y-6">
          {/* Attendance Table */}
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin h-6 w-6 text-gray-500" />
            </div>
          ) : (
            <>
              {selectedClass ? (
                <>
                  {attendanceNotFound && (!attendanceData || attendanceData.length === 0) && (
                    <div className="w-full flex items-center justify-center my-4">
                      <div className="max-w-xl w-full text-center p-4 bg-yellow-50 border border-yellow-200 rounded-lg shadow-sm">
                        <div className="flex items-center justify-center gap-3">
                          <div className="p-2 rounded-full bg-yellow-100 text-yellow-700">
                            <AlertCircle className="h-6 w-6" />
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-yellow-900">لم تتم إضافة طالبات إلى هذا الفصل بعد.</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {attendanceData && attendanceData.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table className="responsive-table">
                        <TableHeader>
                            <TableRow className="bg-neutral-100">
                            {/* Delete column on the left side */}
                            <TableHead className="text-center">حذف</TableHead>
                            <TableHead className="text-center">الحضور</TableHead>
                            {/* Excused column removed */}
                            <TableHead className="text-right">اسم الطالب</TableHead>
                            {/* hide roll number on very small screens to avoid cramped layout */}
                            <TableHead className="text-right hidden sm:table-cell">رقم الطالب</TableHead>
                          </TableRow>
                        </TableHeader>
                          <TableBody>
                            {Array.isArray(attendanceData) && attendanceData
                              .filter((s) => s.studentId && String(s.studentId).trim() !== "" && String(s.studentId).trim() !== "0")
                              .map((student, index) => {
                              const idKey = student.studentId ?? `${student.name}-${index}`;
                              return (
                                <StudentRow
                                  key={idKey}
                                  student={student}
                                  index={index}
                                  onDelete={(s) => { setDeleteTarget(s); setDeleteDialogOpen(true); }}
                                  onToggle={handleToggle}
                                  saving={savingIds.has(String(student.studentId ?? student.name))}
                                />
                              );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-center text-gray-500 mt-4">اختر فصلاً لعرض الطلاب.</p>
              )}
            </>
          )}
          {/* Save / Actions Buttons */}
          <div className="flex justify-center pt-4 gap-3 btn-group">
            <Button onClick={() => handleToggleAll(true)} disabled={!selectedClass || loading} variant="ghost" className="btn-responsive-full">
              جميعاً حاضر
            </Button>
            <Button onClick={() => handleToggleAll(false)} disabled={!selectedClass || loading} variant="ghost" className="btn-responsive-full">
              جميعاً غائب
            </Button>
            <Button onClick={handleExportCSV} disabled={!attendanceData || attendanceData.length === 0} variant="outline" className="btn-responsive-full">
              تصدير CSV
            </Button>
            <Button onClick={handleSave} disabled={!selectedClass || loading} className="btn-responsive-full">
              حفظ الحضور
            </Button>
            {/* rows without a valid studentId are intentionally hidden from the table and will be skipped on save */}
            {/* removed single-save button per request */}
            {/* debug toggle removed per user request */}
          </div>
          {/* Debug panel removed per user request */}
          {/* Delete confirmation dialog (replaces native confirm) */}
          <AlertDialog open={deleteDialogOpen} onOpenChange={(v) => { if (!v) setDeleteTarget(null); setDeleteDialogOpen(v); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                <AlertDialogDescription>هل أنت متأكد أنك تريد حذف هذه الطالبة؟ هذا الإجراء لا يمكن التراجع عنه.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeleteDialogOpen(false)}>إلغاء</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    // perform delete for deleteTarget
                    if (!deleteTarget || !deleteTarget.studentId) {
                      toast.error("لا يوجد هدف صالح للحذف");
                      setDeleteDialogOpen(false);
                      return;
                    }
                    const student = deleteTarget;
                    const key = String(student.studentId ?? student.name ?? "");
                    try {
                      setSavingIds((s) => new Set([...(Array.from(s) || []), key]));
                      await deleteStudent(student.studentId);
                      setAttendanceData((prev) => prev.filter((p) => String(p.studentId ?? p.name ?? "") !== String(student.studentId ?? student.name ?? "")));
                      if (selectedClass && typeof selectedClass.studentCount !== 'undefined') {
                        const current = Number(selectedClass.studentCount) || 0;
                        const updated = Math.max(0, current - 1);
                        try { await updateClass(selectedClass.id, { ...selectedClass, studentCount: updated }); } catch (err) { console.warn('updateClass failed while adjusting studentCount', err); }
                        setSelectedClass((prev) => (prev ? { ...prev, studentCount: updated } : prev));
                      }
                      toast.success("تم حذف الطالبة");
                    } catch (err) {
                      console.error('Failed to delete student', err);
                      const msg = err?.response?.data?.message || err?.message || 'فشل الحذف';
                      toast.error(msg);
                    } finally {
                      setSavingIds((s) => {
                        const copy = new Set(s);
                        copy.delete(key);
                        return copy;
                      });
                      setDeleteDialogOpen(false);
                      setDeleteTarget(null);
                    }
                  }}
                >
                  حذف نهائي
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {/* Reason / Excused dialog when marking absent */}
          <AlertDialog open={reasonDialogOpen} onOpenChange={(v) => { if (!v) setReasonTarget(null); setReasonDialogOpen(v); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  تسجيل غياب
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {reasonTarget ? `${reasonTarget.name} سيتم تسجيل غياب للطالب/ـة` : 'سيتم تسجيل غياب للطالب'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <div className="flex flex-col gap-3 w-full">
                  <div className="flex items-center justify-between">
                    <div className="text-right">
                      <div className="font-medium">هل يوجد سبب للغياب؟</div>
                      <div className="text-sm text-gray-500">اختر إن كان الغياب بعذر (مع عذر) أو بدون عذر ثم اضغط حفظ</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={!!reasonExcused} onCheckedChange={(v) => setReasonExcused(!!v)} />
                    <span className="text-sm">{reasonExcused ? 'مع عذر' : 'بدون عذر'}</span>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <AlertDialogCancel onClick={handleReasonCancel}>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReasonSave}>حفظ</AlertDialogAction>
                </div>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

export default Attendance;
