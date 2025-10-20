import { useEffect, useState, useMemo, useCallback } from "react";
import axios from "axios";
import { useAttendance } from "@/contexts/AttendanceContext";
import { useStudent } from "@/contexts/StudentContext";
import { useClass } from "@/contexts/ClassContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, AlertCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function Attendance() {
  const { fetchClassAttendanceByDate, addAttendance, updateAttendance, loading, attendanceNotFound, lastErrorDetail, clearLastError, showDebugPanel, setShowDebugPanel } = useAttendance();
  const { selectedClass, selectedDate } = useClass();
  const { fetchStudents } = useStudent();
  const [attendanceData, setAttendanceData] = useState([]);
  const [allPresent, setAllPresent] = useState(false);
  const [savingIds, setSavingIds] = useState(new Set());
  const [dirtyKeys, setDirtyKeys] = useState(new Set());

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

      // API expects date in YYYY-MM-DD format (not full DateTime). Use en-CA locale or ISO slice.
      const dateParam = selectedDate.toISOString().slice(0, 10); // YYYY-MM-DD
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
          return { ...a, studentId, name, rollNumber, isAbsent };
        })
        .filter((n) => (n.studentId !== null) || (n.name && n.name.length > 0));

      const attendanceMap = new Map();
      for (const n of normalized) {
        const key = n.studentId != null ? String(n.studentId) : n.name;
        attendanceMap.set(key, { studentId: n.studentId, name: n.name, rollNumber: n.rollNumber, isAbsent: n.isAbsent, id: n.id });
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
            id: match?.id,
          };
        });
        // show roster (every student) and merge attendance flags
        setAttendanceData(merged);
      } else {
        // no roster available; fall back to attendance items (may be partial)
        const deduped = Array.from(new Map(normalized.map((n) => [n.studentId != null ? String(n.studentId) : n.name, n])).values()).map((n) => ({
          studentId: n.studentId,
          name: n.name,
          rollNumber: n.rollNumber,
          isAbsent: n.isAbsent,
          id: n.id,
        }));
        setAttendanceData(deduped);
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
  const handleToggle = (student, checked) => {
    const key = String(student.studentId ?? student.name ?? "unknown");
    // determine new isAbsent value (checked=true means present)
    const newIsAbsent = typeof checked === "boolean" ? !checked : !student.isAbsent;

    // Optimistically update the UI only
    setAttendanceData((prev) => prev.map((item) => (String(item.studentId ?? item.name ?? "") === String(student.studentId ?? student.name ?? "") ? { ...item, isAbsent: newIsAbsent } : item)));

    // mark as dirty so Save will persist later
    setDirtyKeys((s) => {
      const copy = new Set(s);
      copy.add(key);
      return copy;
    });
  };

  const handleSave = async () => {
    // Save all rows one-by-one (sequential) — preferred to avoid batch issues on server
    if (!selectedClass?.id) {
      toast.error("الرجاء اختيار فصل دراسي أولاً");
      return;
    }

    const isoDate = selectedDate.toISOString();
    const rows = Array.isArray(attendanceData) ? attendanceData : [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const key = String(row.studentId ?? row.name ?? i);
      // only save rows that appear dirty (or save all if you prefer)
      if (dirtyKeys.size > 0 && !dirtyKeys.has(key)) continue;

      setSavingIds((s) => {
        const copy = new Set(s);
        copy.add(key);
        return copy;
      });

      try {
        if (!row.id) {
          // create initial record by POSTing directly to the absolute API URL with id equal to student id
          const rec = {
            id: row.studentId,
            studentId: row.studentId,
            classId: selectedClass.id,
            date: isoDate,
            isAbsent: !!row.isAbsent,
          };
          try {
            await axios.post("https://school-discipline.runasp.net/api/Attendance", rec, { headers: { 'Content-Type': 'application/json' } });
            // update local state with the id (we used studentId as id)
            setAttendanceData((prev) => prev.map((item) => (String(item.studentId ?? item.name ?? "") === String(row.studentId ?? row.name ?? "") ? { ...item, id: row.studentId } : item)));
          } catch (e) {
            console.error("Error creating attendance record via absolute POST", e);
            errors.push({ row, err: e });
          }
        } else {
          // update existing via PUT (updateAttendance prefers PUT)
          await updateAttendance(row.id, {
            id: row.id,
            studentId: row.studentId,
            classId: selectedClass.id,
            date: isoDate,
            isAbsent: !!row.isAbsent,
          });
        }
      } catch (err) {
        console.error("Error saving attendance row", row, err);
        errors.push({ row, err });
      } finally {
        setSavingIds((s) => {
          const copy = new Set(s);
          copy.delete(key);
          return copy;
        });
      }

      // small delay between requests
      // eslint-disable-next-line no-await-in-loop
      await new Promise((res) => setTimeout(res, 150));
    }

    // refresh server state and clear dirty flags
    try {
      await loadAttendance();
      setDirtyKeys(new Set());
    } catch (e) {
      console.error("Error reloading attendance after save", e);
    }

    if (errors.length === 0) toast.success("تم حفظ الحضور والغياب بنجاح");
    else toast.error(`فشل حفظ ${errors.length} سجل — تحقق من اللوحة`);
  };

  // Save a single student's attendance (useful for debugging server-side batch issues)
  const handleSaveSingle = async (student) => {
    try {
      if (!selectedClass?.id) {
        toast.error("الرجاء اختيار فصل دراسي أولاً");
        return;
      }
      const isoDate = selectedDate.toISOString();
      // Save single row using same sequential logic: create if missing, otherwise update
      const key = String(student.studentId ?? student.name ?? "unknown");
      setSavingIds((s) => new Set([...(Array.from(s) || []), key]));
      if (!student.id) {
        const created = await addAttendance([
          {
            studentId: student.studentId,
            classId: selectedClass.id,
            date: isoDate,
            isAbsent: !!student.isAbsent,
          },
        ]);
        let createdRec = null;
        if (Array.isArray(created) && created.length > 0) createdRec = created[0];
        else if (created && typeof created === "object") createdRec = created;
        if (createdRec && createdRec.id) {
          setAttendanceData((prev) => prev.map((item) => (String(item.studentId ?? item.name ?? "") === String(student.studentId ?? student.name ?? "") ? { ...item, id: createdRec.id, isAbsent: !!createdRec.isAbsent } : item)));
        }
      } else {
        await updateAttendance(student.id, {
          id: student.id,
          studentId: student.studentId,
          classId: selectedClass.id,
          date: isoDate,
          isAbsent: !!student.isAbsent,
        });
      }
      setSavingIds((s) => {
        const copy = new Set(s);
        copy.delete(key);
        return copy;
      });
      setDirtyKeys((s) => {
        const copy = new Set(s);
        copy.delete(key);
        return copy;
      });
      toast.success(`تم حفظ حالة ${student.name || student.studentId}`);
    } catch (err) {
      console.error('Error saving single attendance', err);
      toast.error('خطأ عند حفظ سجل واحد — تحقق من لوحة التصحيح');
    }
  };
  
  const handleToggleAll = (present) => {
    setAttendanceData((prev) => prev.map((p) => ({ ...p, isAbsent: !present })));
    setAllPresent(present);
  };
  
  const handleExportCSV = () => {
    const exportList = Array.isArray(attendanceData) ? attendanceData : [];
    const dedupedExport = Array.from(new Map(exportList.map((a) => [a.studentId, a])).values());
    if (!dedupedExport || dedupedExport.length === 0) {
      toast.error("لا يوجد بيانات لتصدير");
      return;
    }
  
    const headers = ["name", "rollNumber", "date", "isAbsent"];
  const dateStr = selectedDate.toISOString();
  const rows = dedupedExport.map((r, idx) => [r.name || "", r.rollNumber || idx + 1, dateStr, r.isAbsent]);
  
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
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
                            <div className="font-semibold text-yellow-900">لا توجد بيانات حضور</div>
                            <div className="text-sm text-yellow-800 mt-1">
                              يبدو أن الخادم لم يسجل بيانات الحضور لهذا التاريخ بعد. يمكنك تعديل الحالة هنا وسيتم حفظها عند الضغط على حفظ.
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-center gap-3">
                          <button
                            className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md text-sm"
                            onClick={() => {
                              if (selectedClass?.id) {
                                fetchClassAttendanceByDate(selectedClass.id, selectedDate.toISOString().slice(0, 10));
                                toast.info("جاري إعادة المحاولة...");
                              }
                            }}
                          >
                            إعادة المحاولة
                          </button>
                          <button
                            className="px-3 py-1.5 bg-white border border-yellow-200 text-yellow-900 rounded-md text-sm"
                            onClick={() => {
                              document.querySelector('button:contains("اضافة طالبات")')?.click();
                            }}
                          >
                            إضافة/استيراد طلاب
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {attendanceData && attendanceData.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-neutral-100">
                            <TableHead className="text-center">الحضور</TableHead>
                            <TableHead className="text-right">اسم الطالب</TableHead>
                            <TableHead className="text-right">رقم الطالب</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {attendanceData.map((student, index) => {
                            const idKey = student.studentId ?? `${student.name}-${index}`;
                            return (
                              <TableRow key={idKey}>
                                <TableCell className="flex flex-row-reverse items-center justify-center gap-4">
                                  <Switch checked={!student.isAbsent} onCheckedChange={(checked) => handleToggle(student, checked)} disabled={savingIds.has(student.studentId ?? student.name)} className="rotate-180" />
                                  <div className="flex items-center gap-2">
                                    <span className={`${student.isAbsent ? "text-red-500" : "text-green-700"} font-bold`}>
                                      {student.isAbsent ? "غائب" : "حاضر"}
                                    </span>
                                    {savingIds.has(student.studentId ?? student.name) && <Loader2 className="animate-spin h-4 w-4 text-gray-400" />}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex flex-col items-end">
                                    <span>{student.name}</span>
                                    {/* IDs removed from entry display as requested */}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right flex items-center justify-end gap-2">
                                  <span>{student.rollNumber ?? index + 1}</span>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-center text-gray-500 mt-4">لا يوجد طلاب في هذا الفصل.</p>
                  )}
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
            {/* removed single-save button per request */}
            {/* debug toggle removed per user request */}
          </div>
          {/* Debug panel removed per user request */}
        </CardContent>
      </Card>
    </div>
  );
}

export default Attendance;
