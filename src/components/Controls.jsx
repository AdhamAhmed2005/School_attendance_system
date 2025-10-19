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
import { Calendar } from "./ui/calendar";

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
      const lines = ev.target.result
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      setBulkNames(lines);
    };
    reader.readAsText(file, "utf-8");
  };

  const saveBulkNames = async () => {
    try {
      if (!bulkNames || bulkNames.length === 0) {
        console.warn("No students to save");
        return;
      }

      const studentsData = bulkNames
        .filter((name) => name && name.trim() !== "")
        .map((name, index) => ({
          name: name.trim(),
          classId: selectedClass.id,
          rollNumber: `A${String(index + 1).padStart(2, "0")}`,
        }));

      // 🧠 Prevent re-importing existing students (frontend check)
      const existing = await fetchStudents(selectedClass.id);
      const existingNames = new Set(existing.map((s) => s.name.trim()));

      const newStudents = studentsData.filter((s) => !existingNames.has(s.name.trim()));

      if (newStudents.length === 0) {
        console.log("✅ All students already exist — skipping import");
        return;
      }

      await importStudents(newStudents);
      await fetchStudents(selectedClass.id);
      setShowBulkInput(false);
    } catch (error) {
      console.error("Error saving students:", error);
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
                {classes.map((cls) => (
                  <div key={cls?.id || Date.now()} className="flex flex-row-reverse items-center justify-between px-2">
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
                ))}
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
                <input type="file" accept=".txt" onChange={importFromFile} className="hidden" id="import-file" />
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
