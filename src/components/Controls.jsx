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
  } = useClass();
  const { importStudents, fetchStudents } = useStudent();
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
    await addClass(formData);
    setOpenAdd(false);
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

  const confirmDelete = async () => {
    if (deleteTarget) {
      await deleteClass(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

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

  const importFromFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
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
    try {
      if (!selectedClass) {
        toast.error("اختر فصلًا أولاً");
        return;
      }

      if (!bulkNames || bulkNames.length === 0) {
        toast.error("لا توجد أسماء لحفظها");
        return;
      }

      // Fetch existing students for this class to compute roll offset and prevent duplicates
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

      const studentsData = cleaned.map((name, index) => ({
        name: name,
        classId: selectedClass.id,
        rollNumber: `A${String(rollStart + index + 1).padStart(2, "0")}`,
      }));

      const newStudents = studentsData.filter((s) => !existingNames.has((s.name || "").trim().toLowerCase()));
      const skipped = studentsData.length - newStudents.length;

      if (newStudents.length === 0) {
        toast(`لم تتم إضافة أي طالبات — ${skipped} مكرر${skipped > 1 ? "ات" : ""}`);
        return;
      }

      await importStudents(newStudents);
      await fetchStudents(selectedClass.id);
      // After importing students, create attendance records for the selected date for this class.
      try {
        // fetch fresh students with ids
        const fresh = await fetchStudents(selectedClass.id);
        const studentArray = Array.isArray(fresh) ? fresh : fresh ? [fresh] : [];
        if (studentArray.length > 0) {
          const isoDate = selectedDate.toISOString();
          const errors = [];
          // Create attendance records one-by-one to avoid batch POST failure on the server
          for (const s of studentArray) {
            // Initialize record as absent so each student has a concrete attendance id
            const rec = {
              id: s.id, // set id equal to student id per request
              studentId: s.id,
              classId: selectedClass.id,
              date: isoDate,
              isAbsent: true,
            };
            try {
              // POST directly to the absolute API endpoint (bypass local baseURL) as requested
              // This will attempt to create the attendance record with the specified id
              await axios.post("https://school-discipline.runasp.net/api/Attendance", rec, { headers: { 'Content-Type': 'application/json' } });
              // No per-record refresh here; we'll refresh once after the loop
            } catch (e) {
              console.error("Failed to create attendance for", s.id, e);
              errors.push({ studentId: s.id, error: e?.message || String(e) });
            }
            // small delay to avoid overwhelming server
            await new Promise((res) => setTimeout(res, 150));
          }
          // refresh server attendance for this class/date so ids are present in client state
          await fetchClassAttendanceByDate(selectedClass.id, selectedDate.toISOString().slice(0,10));
          if (errors.length === 0) toast.success(`تم إنشاء سجلات حضور ${studentArray.length} طالباً`);
          else toast.error(`تم إنشاء سجلات معظم الطلاب، لكن فشل ${errors.length} سجل — تحقق من التصحيح`);
        }
      } catch (err) {
        console.error('Error creating attendance after import', err);
        toast.error('فشل إنشاء سجلات الحضور تلقائياً — تحقق من التصحيح');
      }
      setShowBulkInput(false);
      toast.success(`تم إضافة ${newStudents.length} طالب${newStudents.length > 1 ? "ات" : ""}${skipped > 0 ? `، ${skipped} مكرر تم تجاهله` : ""}`);
    } catch (error) {
      console.error("Error saving students:", error);
      toast.error("حدث خطأ أثناء حفظ الأسماء");
    }
  };

  return (
    <Card className="mb-6 shadow-sm">
      <CardHeader className="flex items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-1 sm:gap-2 cursor-pointer border border-neutral-200 px-2.5 sm:px-3 py-1.5 rounded-md hover:bg-neutral-100 hoverEffect">
          <Users className="h-5 w-5" />
          <span className="text-[16px] sm:text-base">اختيار الفصل</span>
        </CardTitle>
        <Dialog open={openAdd} onOpenChange={setOpenAdd}>
          <DialogTrigger asChild>
            <CardTitle className="flex items-center gap-1 sm:gap-2 cursor-pointer border border-neutral-200 px-2.5 sm:px-3 py-1.5 rounded-md hover:bg-neutral-100 hoverEffect">
              <CirclePlus className="h-5 w-5" />
              <span className="text-[16px] sm:text-base">إضافة فصل</span>
            </CardTitle>
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
              <DialogFooter className="mt-4 grid grid-cols-2 gap-3">
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                  إضافة
                </Button>
                <Button type="button" variant="outline" onClick={() => setOpenAdd(false)}>
                  إلغاء
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          <Label>الفصل الدراسي</Label>
          <div className="flex items-center gap-2">
            <Select
              value={selectedClass?.id?.toString() || ""}
              onValueChange={(value) => {
                const cls = classes.find((c) => c.id?.toString() === value);
                setSelectedClass(cls);
              }}
              className="flex-1"
            >
              <SelectTrigger className="flex-1 justify-end text-right">
                <SelectValue placeholder="اختر الفصل" className="text-right justify-end" />
              </SelectTrigger>
              <SelectContent>
                {Array.isArray(classes) ? (
                  classes.map((cls, idx) => (
                    <div key={cls?.id ?? `cls-${idx}`} className="flex flex-row-reverse items-center justify-between px-2">
                    <SelectItem value={cls.id?.toString()} className="flex-1 text-right justify-end">
                      {cls.className} ({cls.studentCount} طالبة)
                      {cls.director && ` - ${cls.director}`}
                    </SelectItem>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 rounded-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(cls);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="space-y-4">
                        <AlertDialogHeader className="space-y-4">
                          <AlertDialogTitle className="text-right">تأكيد الحذف</AlertDialogTitle>
                          <AlertDialogDescription className="text-right">
                            هل أنت متأكد من حذف هذا الفصل؟
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="grid grid-cols-2 gap-3">
                          <AlertDialogCancel>إلغاء</AlertDialogCancel>
                          <AlertDialogAction onClick={confirmDelete}>حذف</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-right text-gray-500">
                    {console.warn("Controls: expected 'classes' to be an array, got:", classes) || "لا توجد فصول متاحة"}
                  </div>
                )}
              </SelectContent>
            </Select>
            <Button
              disabled={!selectedClass}
              onClick={openUpdateDialog}
              className="whitespace-nowrap bg-blue-500 hover:bg-blue-600 text-white"
            >
              تحديث الفصل
            </Button>
          </div>
        </div>
        {selectedClass && (
          <div className="flex flex-col-reverse sm:flex-row-reverse sm:justify-between mt-5 gap-4" dir="rtl">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              locale={ar}
              className="rounded-md border w-72"
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
              <div className="flex justify-start mt-4">
                <Button className="bg-blue-500 hover:bg-blue-600" onClick={() => handleOpenStudentsPopup(true)}>
                  اضافة طالبات
                </Button>
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
            <DialogFooter className="mt-4 grid grid-cols-2 gap-3">
              <Button type="submit" className="bg-blue-500 hover:bg-blue-600">
                تحديث
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpenUpdate(false)}>
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
                <input type="file" accept=".txt,.csv" onChange={importFromFile} className="hidden" id="import-file" />
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
                <Button onClick={saveBulkNames} className="bg-blue-600 hover:bg-blue-700">
                  حفظ الأسماء
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
