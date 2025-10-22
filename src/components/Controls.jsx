import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { CirclePlus, Users, Trash2 } from "lucide-react";
import { ar } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useClass } from "@/contexts/ClassContext";
import { useStudent } from "@/contexts/StudentContext";
import { useAttendance } from "@/contexts/AttendanceContext";
import axios from "axios";
import * as XLSX from "xlsx";
import { Calendar } from "./ui/calendar";
import { toast } from "sonner";

function Controls() {
  const {
    addClass,
    updateClass,
    deleteClass,
    classes,
    selectedClass,
    setSelectedClass,
    selectedDate,
    setSelectedDate,
    fetchClassById,
  } = useClass();
  const { importStudents, fetchStudents, updateStudent, addStudent } = useStudent();
  const { addAttendance, fetchClassAttendanceByDate } = useAttendance();
  const [students, setStudents] = useState([]);

  useEffect(() => {
    const getClassStudents = async () => {
      try {
        const students = await fetchStudents(selectedClass?.id);
        setStudents(students);
      } catch (error) {
        console.error("Error fetching students for class:", error);
        setStudents([]);
      }
    };

    getClassStudents();
  }, [selectedClass, fetchStudents]);

  useEffect(() => {
    if (classes.length > 0 && !selectedClass) {
      setSelectedClass(classes[0]);
    }
  }, [classes, selectedClass, setSelectedClass]);

  const [openAdd, setOpenAdd] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isSavingNames, setIsSavingNames] = useState(false);
  const [formData, setFormData] = useState({
    academicTerm: "",
    className: "",
    studentCount: "",
    director: "",
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleAddClass = async (e) => {
    e.preventDefault();
    try {
      setIsAdding(true);
      const created = await addClass(formData);
      if (created && created.id) {
        setSelectedClass(created);
      } else {
        // fallback: refresh classes and pick last
        await new Promise((r) => setTimeout(r, 200));
      }
    } finally {
      setIsAdding(false);
      setOpenAdd(false);
    }
    setFormData({ academicTerm: "", className: "", studentCount: "", director: "" });
  };

  const [openUpdate, setOpenUpdate] = useState(false);
  const [updateData, setUpdateData] = useState({
    academicTerm: "",
    className: "",
    studentCount: "",
    director: "",
  });

  const handleUpdate = async (e) => {
    e.preventDefault();

    if (selectedClass) {
      await updateClass(selectedClass.id, { id: selectedClass.id, ...updateData });
      setSelectedClass({ id: selectedClass.id, ...updateData });
      setOpenUpdate(false);
    }
  };

  const openUpdateDialog = () => {
    if (selectedClass) {
      setUpdateData({
        academicTerm: selectedClass.academicTerm || "",
        className: selectedClass.className || "",
        studentCount: selectedClass.studentCount || "",
        director: selectedClass.director || "",
      });
      setOpenUpdate(true);
    }
  };

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  const confirmDelete = async () => {
    const idToDelete = deleteTargetId ?? deleteTarget?.id;
    if (idToDelete) {
      try {
        await deleteClass(idToDelete);
        toast.success(`تم حذف الفصل ${idToDelete}`);
      } catch (err) {
        console.error('Failed to delete class', err);
        const serverMsg = err?.response?.data?.message || err?.message || 'حدث خطأ في الخادم';
        toast.error(`فشل الحذف: ${serverMsg}`);
      } finally {
        setDeleteTarget(null);
        setDeleteTargetId(null);
      }
    }
  };

  // deleted prefetchDeleteInfo and deleteHelp state to avoid extra API calls

  const [showBulkInput, setShowBulkInput] = useState(false);
  const [bulkNames, setBulkNames] = useState([]);

  const handleOpenStudentsPopup = async () => {
    setShowBulkInput(true);

    try {
      const studentsData = await fetchStudents(selectedClass.id);
      if (studentsData && studentsData.length > 0) {
        setBulkNames(studentsData.map((s) => s.name || ""));
      } else {
        // Empty boxes equal to student count
        setBulkNames(
          Array(parseInt(selectedClass.studentCount) || 25)
            .fill("")
            .map((_, i) => `طالبة ${i + 1}`)
        );
      }
    } catch (error) {
      console.error("Error opening students popup:", error);
    }
  };

  // Helper to add a single student by POSTing an array to /api/Student
  const importFromSingle = async (payload) => {
    // payload: { name: string, classId: number }
    if (!payload || !payload.name || !String(payload.name).trim()) throw new Error("الاسم فارغ");
    // POST an array as requested: [{ name, classId }]
  const res = await axios.post("/Student", [payload]);
    // Refresh roster for the class
    if (payload.classId) {
      await fetchStudents(payload.classId);
    } else {
      await fetchStudents();
    }
    return res.data;
  };

  const importFromFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const ext = (file.name || "").split('.').pop().toLowerCase();
    // XLSX / XLS handling
    if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = ev.target.result;
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          // Prefer object parsing so headers are keys; this allows matching header exactly like 'اسم الطالبة'
          const objRows = XLSX.utils.sheet_to_json(sheet, { defval: '' }); // array of objects keyed by header
          if (!objRows || objRows.length === 0) {
            toast.error('الملف لا يحتوي على بيانات');
            return;
          }

          const keys = Object.keys(objRows[0] || {});
          const normalizeKey = (k) => (k === null || k === undefined ? '' : String(k).trim().replace(/\s+/g, '').toLowerCase());

          // Exact key match candidates (after normalization)
          const keyCandidates = keys.map((k) => ({ raw: k, norm: normalizeKey(k) }));
          // Match exact patterns like 'name', 'الاسم', 'اسم', 'اسمالطالبة', 'اسمالطالب'
          let found = keyCandidates.find((x) => /^(name|الاسم|اسم|اسمالطالبة|اسمالطالب)$/.test(x.norm));
          // Fallback: any key containing 'name' or 'اسم'
          if (!found) found = keyCandidates.find((x) => /(name|اسم)/i.test(x.raw));

          let extracted = [];
          if (found) {
            const key = found.raw;
            extracted = objRows.map((r) => (r && r[key] != null ? String(r[key]).trim() : '')).filter(Boolean);
          } else {
            // Fallback: analyze the sheet by columns and pick the column most likely to contain person names.
            const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            const rowCount = matrix.length;
            const colCount = matrix.reduce((m, r) => Math.max(m, (r || []).length), 0);

            // First try: scan entire sheet for an explicit header cell like 'اسم الطالبة' and extract below it
            const normalizeCell = (c) => (c === null || c === undefined ? '' : String(c).trim().replace(/\s+/g, '').toLowerCase());
            let headerFound = null;
            for (let ri = 0; ri < matrix.length && !headerFound; ri++) {
              const row = matrix[ri] || [];
              for (let ci = 0; ci < row.length; ci++) {
                const norm = normalizeCell(row[ci]);
                if (/^(name|الاسم|اسم|اسمالطالبة|اسمالطالب)$/.test(norm) || /اسم/.test(norm)) {
                  headerFound = { row: ri, col: ci };
                  break;
                }
              }
            }

            if (headerFound) {
              const vals = [];
              for (let ri = headerFound.row + 1; ri < matrix.length; ri++) {
                const cell = (matrix[ri] && matrix[ri][headerFound.col]) || '';
                const v = cell == null ? '' : String(cell).trim();
                if (v) vals.push(v);
              }
              extracted = vals.filter(Boolean);
              if (extracted.length > 0) {
                setBulkNames(extracted);
                toast.success(`تم استيراد ${extracted.length} اسم${extracted.length > 1 ? 'ات' : ''}`);
                return;
              }
              // otherwise fall back to heuristic
            }

            const nameCharRx = /[A-Za-z\u0600-\u06FF]/; // Latin or Arabic letters
            const badPhrasesRx = /(ISBN|McGraw|Hill|We can|page|class|الفصل|منهج|كتاب|مادة|عام بنات)/i;

            const scoreColumn = (ci) => {
              let score = 0;
              let validRows = 0;
              for (let ri = 0; ri < rowCount; ri++) {
                const cell = (matrix[ri] && matrix[ri][ci]) || '';
                const v = cell == null ? '' : String(cell).trim();
                if (!v) continue;
                validRows += 1;
                // letters present
                if (nameCharRx.test(v)) score += 2;
                // short-ish (names usually not extremely long)
                const words = v.split(/\s+/).filter(Boolean).length;
                if (words <= 4) score += 1;
                if (v.length <= 60) score += 1;
                // penalize numeric or obvious non-name phrases
                if (/\d/.test(v)) score -= 2;
                if (badPhrasesRx.test(v)) score -= 3;
                // penalize if contains many punctuation characters (likely sentences)
                const punctCount = (v.match(/[.,:;\-/()]/g) || []).length;
                if (punctCount > 2) score -= 1;
              }
              // normalize by rows considered
              return validRows > 0 ? score / validRows : -Infinity;
            };

            let bestIdx = -1;
            let bestScore = -Infinity;
            for (let ci = 0; ci < colCount; ci++) {
              const s = scoreColumn(ci);
              if (s > bestScore) {
                bestScore = s;
                bestIdx = ci;
              }
            }

            if (bestIdx === -1 || bestScore === -Infinity) {
              // nothing useful found
              extracted = [];
            } else {
              // pick values from the chosen column; skip empty rows and potential header row if present
              const vals = [];
              // Determine if first row looks like header by checking keys presence in objRows (already false here)
              for (let ri = 0; ri < matrix.length; ri++) {
                const cell = (matrix[ri] && matrix[ri][bestIdx]) || '';
                const v = cell == null ? '' : String(cell).trim();
                if (v) vals.push(v);
              }
              extracted = vals.filter(Boolean);
              console.warn('Controls.importFromFile: chose column', bestIdx, 'score', bestScore, 'sample:', extracted.slice(0,5));
            }
          }

          if (extracted.length === 0) {
            toast.error('لم يتم العثور على أسماء صالحة في ملف XLSX');
            return;
          }

          setBulkNames(extracted);
          toast.success(`تم استيراد ${extracted.length} اسم${extracted.length > 1 ? 'ات' : ''}`);
        } catch (err) {
          console.error('Failed to parse XLSX', err);
          toast.error('فشل قراءة ملف XLSX');
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    // Fallback for CSV/TXT
    const reader = new FileReader();
    reader.onload = (ev) => {
      // split on CRLF or LF, trim, skip empty lines
      const raw = ev.target.result || "";
      const lines = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          // If CSV, take first column
          const first = line.split(",")[0];
          return first ? first.trim() : "";
        })
        .filter(Boolean);
      if (lines.length === 0) {
        toast.error("الملف لا يحتوي على أسماء صالحة");
        return;
      }
      setBulkNames(lines);
      toast.success(`تم استيراد ${lines.length} اسم${lines.length > 1 ? "ات" : ""}`);
    };
    reader.readAsText(file, "utf-8");
  };

  const saveBulkNames = async () => {
    // show spinner and disable button immediately
    setIsSavingNames(true);
    try {
      if (!selectedClass) {
        toast.error("اختر فصلًا أولاً");
        return;
      }

      if (!bulkNames || bulkNames.length === 0) {
        toast.error("لا توجد أسماء لحفظها");
        return;
      }

      // Fetch existing students for this class to compute roll offset and to decide update vs create
      const existingRaw = await fetchStudents(selectedClass.id);
      const existing = Array.isArray(existingRaw) ? existingRaw : existingRaw ? [existingRaw] : [];
      const existingNames = new Set(existing.map((s) => (s.name || "").trim().toLowerCase()));

      const cleaned = bulkNames
        .map((n) => (n || "").trim())
        .filter((n) => n !== "");

      if (cleaned.length === 0) {
        toast.error("لا توجد أسماء صالحة لحفظها");
        return;
      }

      const rollStart = existing.length; // continue numbering after existing students

      // Decide per-index whether this is an update (existing index) or a create (extra entries)
      const toUpdate = [];
      const toCreate = [];

      for (let i = 0; i < cleaned.length; i++) {
        const name = cleaned[i];
        if (i < existing.length) {
          const ex = existing[i];
          if ((ex?.name || "").trim().toLowerCase() !== name.trim().toLowerCase()) {
            toUpdate.push({ id: ex.id, name: name, classId: selectedClass.id, rollNumber: ex.rollNumber ?? ex.roll ?? `A${String(i + 1).padStart(2, "0")}` });
          }
        } else {
          // new student beyond existing roster
          toCreate.push({ name: name, classId: selectedClass.id, rollNumber: `A${String(rollStart + (i - rollStart) + 1).padStart(2, "0")}` });
        }
      }

      // Deduplicate new creations against existing names
      const dedupedToCreate = toCreate.filter((s) => !existingNames.has((s.name || "").trim().toLowerCase()));
      const skipped = toCreate.length - dedupedToCreate.length;

      // Apply updates sequentially (safer) and collect failures
      const updateErrors = [];
      if (toUpdate.length > 0) {
        for (const u of toUpdate) {
          try {
            await updateStudent(u.id, { id: u.id, name: u.name, classId: u.classId, rollNumber: u.rollNumber });
          } catch (e) {
            console.error('Failed to update student', u.id, e);
            updateErrors.push({ id: u.id, error: e?.message || String(e) });
          }
          // small delay
          // eslint-disable-next-line no-await-in-loop
          await new Promise((res) => setTimeout(res, 80));
        }
      }

      // Create new students if any
      let createdCount = 0;
      try {
          if (dedupedToCreate.length > 0) {
          await importStudents(dedupedToCreate, { classId: selectedClass.id });
          createdCount = dedupedToCreate.length;
        }
      } catch (createErr) {
        console.error('Error importing new students', createErr);
        // We will attempt per-student creation fallback later if needed
      }

      // Refresh roster and update local students state so UI reflects changes immediately
      const refreshed = await fetchStudents(selectedClass.id);
      setStudents(Array.isArray(refreshed) ? refreshed : refreshed ? [refreshed] : []);

      // Nudge the selectedClass object so other components (Attendance) re-run their effects
      // and pick up the updated roster without requiring a full page refresh.
      try {
        setSelectedClass((prev) => (prev ? { ...prev } : prev));
      } catch (e) {
        // ignore if setSelectedClass not available for any reason
      }

      // After saving students, we intentionally do NOT initialize attendance automatically here.
      // The user can create attendance rows explicitly from the Attendance page for the desired date.

      setShowBulkInput(false);
      // Notify user about results
      const updatesMsg = toUpdate.length > 0 ? `، تم تحديث ${toUpdate.length} اسم` : "";
      const createsMsg = createdCount > 0 ? `، تم إضافة ${createdCount} طالب${createdCount > 1 ? "ات" : ""}` : "";
      const skipsMsg = skipped > 0 ? `، ${skipped} مكرر تم تجاهله` : "";
      const failuresMsg = updateErrors.length > 0 ? `، فشل تحديث ${updateErrors.length} طالب` : "";
      toast.success(`تم الحفظ${updatesMsg}${createsMsg}${skipsMsg}${failuresMsg}`);
    } catch (error) {
      console.error("Error saving students:", error);
      toast.error("حدث خطأ أثناء حفظ الأسماء");
    } finally {
      setIsSavingNames(false);
    }
  };

  return (
    <Card className="mb-6 shadow-sm">
  <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 w-full min-w-0">
          <CardTitle className="flex items-center gap-1 sm:gap-2 cursor-pointer border border-neutral-200 px-2.5 sm:px-3 py-1.5 rounded-md hover:bg-neutral-100 hoverEffect min-w-0">
            <Users className="h-5 w-5" />
            <span className="text-[16px] sm:text-base truncate">اختيار الفصل</span>
          </CardTitle>
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild>
              {/* Show Add button on all screen sizes. Previously it was hidden on mobile (hidden sm:flex). */}
              <button type="button" className="flex items-center gap-1 sm:gap-2 cursor-pointer border border-neutral-200 px-2.5 sm:px-3 py-1.5 rounded-md hover:bg-neutral-100 hoverEffect" aria-label="إضافة فصل">
                <CirclePlus className="h-5 w-5" />
                <span className="text-[16px] sm:text-base">إضافة فصل</span>
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="text-center text-lg">إضافة فصل جديد</DialogTitle>
              <DialogDescription className="text-center">أدخل بيانات الفصل الجديد ثم اضغط "إضافة".</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddClass} className="space-y-6 mt-4">
              {/* Academic Term */}
              <div className="flex flex-col gap-3">
                <Label className="text-right">الفصل الدراسي</Label>
                <Select onValueChange={(value) => setFormData({ ...formData, academicTerm: value })}>
                  <SelectTrigger className="w-full justify-end text-right">
                    <SelectValue placeholder="اختر الفصل الدراسي" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="الفصل الدراسي الأول">الفصل الدراسي الأول</SelectItem>
                    <SelectItem value="الفصل الدراسي الثاني">الفصل الدراسي الثاني</SelectItem>
                    <SelectItem value="الفصل الدراسي الثالث">الفصل الدراسي الثالث</SelectItem>
                    <SelectItem value="الفصل الدراسي الرابع">الفصل الدراسي الرابع</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Class Name */}
              <div className="flex flex-col gap-3">
                <Label htmlFor="className" className="text-right">
                  اسم الفصل
                </Label>
                <Input
                  id="className"
                  name="className"
                  value={formData.className}
                  onChange={handleChange}
                  placeholder="أدخل اسم الفصل"
                />
              </div>
              {/* Student Count */}
              <div className="flex flex-col gap-3">
                <Label htmlFor="studentCount" className="text-right">
                  عدد الطلاب
                </Label>
                <Input
                  id="studentCount"
                  name="studentCount"
                  type="number"
                  value={formData.studentCount}
                  onChange={handleChange}
                  placeholder="أدخل عدد الطلاب"
                />
              </div>
              {/* Director */}
              <div className="flex flex-col gap-3">
                <Label htmlFor="director" className="text-right">
                  اسم مشرف الفصل
                </Label>
                <Input
                  id="director"
                  name="director"
                  value={formData.director}
                  onChange={handleChange}
                  placeholder="أدخل اسم مشرف الفصل"
                />
              </div>
              <DialogFooter className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700 btn-responsive-full" disabled={isAdding} aria-busy={isAdding}>
                  {isAdding ? (
                    <span className="inline-flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                      </svg>
                      <span>جاري الإضافة...</span>
                    </span>
                  ) : (
                    "إضافة"
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={() => setOpenAdd(false)} className="btn-responsive-full">
                  إلغاء
                </Button>
              </DialogFooter>
            </form>
      </DialogContent>
    </Dialog>
    </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          <Label>الفصل الدراسي</Label>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 min-w-0">
            <div className="flex items-center gap-2 flex-1 min-w-0 w-full">
              <Select
                value={selectedClass?.id?.toString() || ""}
                onValueChange={(value) => {
                  const cls = classes.find((c) => c.id?.toString() === value);
                  setSelectedClass(cls);
                }}
                className="flex-1"
              >
                <SelectTrigger className="flex-1 justify-end text-right min-w-0 overflow-hidden">
                  <SelectValue placeholder="اختر الفصل" className="text-right justify-end truncate block overflow-hidden" />
                </SelectTrigger>
                <SelectContent>
                  {Array.isArray(classes) ? (
                    classes.map((cls, idx) => (
                      <SelectItem key={cls?.id ?? `cls-${idx}`} value={cls.id?.toString()} className="text-right justify-end">
                        {cls.className} ({cls.studentCount} طالبة){cls.director ? ` - ${cls.director}` : ""}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-right text-gray-500">
                      {console.warn("Controls: expected 'classes' to be an array, got:", classes) || "لا توجد فصول متاحة"}
                    </div>
                  )}
                </SelectContent>
              </Select>

              {/* Single delete control for the currently selected class. Uses existing deleteTarget/confirmDelete flow. */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 rounded-full"
                    onClick={async () => {
                      // store id first to avoid stale objects
                      const clsId = selectedClass?.id;
                      if (!clsId) return;
                      setDeleteTargetId(clsId);
                      await prefetchDeleteInfo(clsId);
                      // attempt to resolve latest class object from server so we delete correct id
                      try {
                        const resolved = await fetchClassById(clsId);
                        setDeleteTarget(resolved || { id: clsId });
                      } catch (e) {
                        setDeleteTarget({ id: clsId });
                      }
                    }}
                    disabled={!selectedClass}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="space-y-4">
                  <AlertDialogHeader className="space-y-4">
                    <AlertDialogTitle className="text-right">تأكيد الحذف</AlertDialogTitle>
                    <AlertDialogDescription className="text-right">هل أنت متأكد من حذف هذا الفصل؟</AlertDialogDescription>
                    {/* deleteHelp details removed per UX request */}
                  </AlertDialogHeader>
                  <AlertDialogFooter className="grid grid-cols-2 gap-3">
                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmDelete}>حذف</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <div className="w-full sm:w-auto flex-shrink-0 mt-2 sm:mt-0">
              <Button
                disabled={!selectedClass}
                onClick={openUpdateDialog}
                className="whitespace-nowrap bg-blue-500 hover:bg-blue-600 text-white btn-responsive-full w-full sm:w-auto"
              >
                تحديث الفصل
              </Button>
            </div>
          </div>
        </div>
        {selectedClass && (
          <div className="flex flex-col-reverse sm:flex-row-reverse sm:justify-between mt-5 gap-4" dir="rtl">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              locale={ar}
              className="rounded-md border w-full sm:w-72"
            />
            <div className="sm:mt-6 flex flex-col gap-6 text-right">
              <div className="flex flex-col gap-2">
                <p>
                  <b>اسم الفصل:</b> {selectedClass.className}
                </p>
                <p>
                  <b>مشرف الفصل:</b> {selectedClass.director}
                </p>
                <p>
                  <b>الفصل الدراسي:</b> {selectedClass.academicTerm}
                </p>
                <p>
                  <b>عدد الطلاب:</b> {selectedClass.studentCount}
                </p>
                <p>
                  <b>تاريخ اليوم:</b> {selectedDate.toLocaleDateString("ar-EG")}
                </p>
              </div>
              <div className="flex flex-wrap justify-start mt-4 gap-2">
                <Button className="bg-blue-500 hover:bg-blue-600 btn-responsive-full" onClick={() => handleOpenStudentsPopup(true)}>
                  تعديل اسامي الطلاب
                </Button>
                {/* Single-add student button and dialog */}
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="btn-responsive-full">إضافة طالب</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                      <DialogTitle className="text-center">إضافة طالب واحد</DialogTitle>
                      <DialogDescription className="text-center">أدخل اسم الطالب ليتم إضافته إلى الفصل المحدد.</DialogDescription>
                    </DialogHeader>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const form = e.target;
                        const input = form.elements["singleStudentName"];
                        const name = (input?.value || "").trim();
                        if (!name) {
                          toast.error("الرجاء إدخال اسم صالح");
                          return;
                        }
                        if (!selectedClass?.id) {
                          toast.error("اختر فصلًا أولاً");
                          return;
                        }
                        try {
                          setIsSavingNames(true);
                          // addStudent expects a single student object
                          await importFromSingle({ name, classId: selectedClass.id });
                          toast.success("تمت إضافة الطالب");
                          // refresh students list
                          const refreshed = await fetchStudents(selectedClass.id);
                          setStudents(Array.isArray(refreshed) ? refreshed : refreshed ? [refreshed] : []);
                          form.reset();
                        } catch (err) {
                          console.error('Failed to add single student', err);
                          const msg = err?.response?.data?.message || err?.message || 'فشل الإضافة';
                          toast.error(msg);
                        } finally {
                          setIsSavingNames(false);
                        }
                      }}
                      className="space-y-4 mt-4"
                    >
                      <div className="flex flex-col gap-2">
                        <Label className="text-right">اسم الطالب</Label>
                        <Input name="singleStudentName" placeholder="أدخل اسم الطالب" />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => { /* close dialog by clicking Cancel via DOM? rely on Dialog component closing */ }}>
                          إلغاء
                        </Button>
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={isSavingNames} aria-busy={isSavingNames}>
                          إضافة
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        )}
      </CardContent>
      <Dialog open={openUpdate} onOpenChange={setOpenUpdate}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-center text-lg">تحديث بيانات الفصل</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-6 mt-4">
            {/* Academic Term */}
            <div className="flex flex-col gap-3">
              <Label className="text-right">الفصل الدراسي</Label>
              <Select
                value={updateData.academicTerm}
                onValueChange={(value) => setUpdateData({ ...updateData, academicTerm: value })}
              >
                <SelectTrigger className="w-full justify-end text-right">
                  <SelectValue placeholder="اختر الفصل الدراسي" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="الفصل الدراسي الأول">الفصل الدراسي الأول</SelectItem>
                  <SelectItem value="الفصل الدراسي الثاني">الفصل الدراسي الثاني</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Class Name */}
            <div className="flex flex-col gap-3">
              <Label htmlFor="className" className="text-right">
                اسم الفصل
              </Label>
              <Input
                id="className"
                name="className"
                value={updateData.className}
                onChange={(e) => setUpdateData({ ...updateData, className: e.target.value })}
              />
            </div>
            {/* Student Count */}
            <div className="flex flex-col gap-3">
              <Label htmlFor="studentCount" className="text-right">
                عدد الطلاب
              </Label>
              <Input
                id="studentCount"
                name="studentCount"
                type="number"
                value={updateData.studentCount}
                onChange={(e) => setUpdateData({ ...updateData, studentCount: e.target.value })}
              />
            </div>
            {/* Director */}
            <div className="flex flex-col gap-3">
              <Label htmlFor="director" className="text-right">
                اسم مشرف الفصل
              </Label>
              <Input
                id="director"
                name="director"
                value={updateData.director}
                onChange={(e) => setUpdateData({ ...updateData, director: e.target.value })}
              />
            </div>
            <DialogFooter className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button type="submit" className="bg-blue-500 hover:bg-blue-600 btn-responsive-full">
                تحديث
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpenUpdate(false)} className="btn-responsive-full">
                إلغاء
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {showBulkInput && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-4xl max-h-[97vh] overflow-hidden">
            <CardHeader className="bg-blue-50 py-4">
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  إدخال أسماء الطالبات - {selectedClass?.className}
                </span>
                <Button variant="ghost" onClick={() => setShowBulkInput(false)}>
                  ✕
                </Button>
              </CardTitle>
              <CardDescription>أدخل أسماء الطالبات أو استورد من ملف نصي (كل اسم في سطر)</CardDescription>
            </CardHeader>
            <CardContent className="px-6">
              <div className="mb-4 flex gap-2">
                <input type="file" accept=".txt,.csv,.xlsx,.xls" onChange={importFromFile} className="hidden" id="import-file" />
                <Button variant="outline" onClick={() => document.getElementById("import-file").click()}>
                  📁 استيراد من ملف
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    setBulkNames(
                      Array(parseInt(selectedClass?.studentCount) || 25)
                        .fill("")
                        .map((_, i) => `طالبة ${i + 1}`)
                    )
                  }
                >
                  إعادة تعيين
                </Button>
              </div>
              <ScrollArea className="h-[50vh] border rounded-md">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 py-6 px-4">
                  {bulkNames.map((name, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-600 w-8">{i + 1}.</span>
                      <Input
                        value={name}
                        onChange={(e) => {
                          const updated = [...bulkNames];
                          updated[i] = e.target.value;
                          setBulkNames(updated);
                        }}
                        placeholder={`طالبة ${i + 1}`}
                        className="flex-1"
                      />
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="mt-6 flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowBulkInput(false)}>
                  إلغاء
                </Button>
                <Button onClick={saveBulkNames} className="bg-blue-600 hover:bg-blue-700" disabled={isSavingNames} aria-busy={isSavingNames}>
                  {isSavingNames ? (
                    <span className="inline-flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                      </svg>
                      <span>جاري الحفظ وإنشاء سجلات الحضور...</span>
                    </span>
                  ) : (
                    "حفظ الأسماء"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </Card>
  );
}

export default Controls;
