import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useClass } from "@/contexts/ClassContext";
import { useStudent } from "@/contexts/StudentContext";
import { useBehavior } from "@/contexts/BehaviorContext";
import { toast } from "sonner";

function Behavior() {
  const { classes, selectedClass: ctxSelectedClass, setSelectedClass } = useClass();
  const { students, fetchStudents } = useStudent();
  const { behaviors, fetchBehaviors, addBehavior, deleteBehavior, loading } = useBehavior();

  // use the shared selectedClass from ClassContext so selection is global
  const selectedClass = ctxSelectedClass;
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [form, setForm] = useState({ behaviorType: 0, description: "", date: new Date().toISOString() });
  const [showClassWide, setShowClassWide] = useState(false);

  const behaviorTypeLabels = ["ملاحظة", "مدح", "تحذير", "عقاب"];

  useEffect(() => {
    if (Array.isArray(classes) && classes.length > 0 && !selectedClass) {
      setSelectedClass(classes[0]);
    }
  }, [classes, selectedClass, setSelectedClass]);

  useEffect(() => {
    if (selectedClass) {
      fetchStudents(selectedClass.id);
      // load class-wide behaviors initially
      fetchBehaviors(selectedClass.id, showClassWide ? null : selectedStudent?.id);
      // reset selected student when class changes
      setSelectedStudent(null);
    }
  }, [selectedClass, fetchStudents, fetchBehaviors]);

  useEffect(() => {
    if (Array.isArray(students) && students.length > 0 && !selectedStudent) {
      setSelectedStudent(students[0]);
    }
  }, [students, selectedStudent]);

  // whenever selectedStudent or selectedClass or the showClassWide toggle changes, reload behaviors
  useEffect(() => {
    if (selectedClass) {
      fetchBehaviors(selectedClass.id, showClassWide ? null : selectedStudent?.id);
    }
  }, [selectedClass, selectedStudent, showClassWide, fetchBehaviors]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedStudent || !selectedClass) return toast.error("حدد الطالبة والفصل أولاً");
    if (!form.behaviorType && form.behaviorType !== 0) return toast.error("اختر نوع السلوك");

    try {
      const payload = {
        studentId: selectedStudent.id,
        classId: selectedClass.id,
        behaviorType: Number(form.behaviorType),
        description: form.description || null,
        date: form.date,
      };
      await addBehavior(payload);
      toast.success("تم تسجيل السلوك");
      setForm({ behaviorType: 0, description: "", date: new Date().toISOString() });
      // reload behaviors for the student
      await fetchBehaviors(selectedClass.id, selectedStudent.id);
    } catch (err) {
      toast.error("حدث خطأ أثناء تسجيل السلوك");
      console.error(err);
    }
  };

  // Helper: convert ISO date to a local datetime-local input value (yyyy-MM-ddTHH:mm)
  const toLocalInputValue = (isoDate) => {
    try {
      const d = new Date(isoDate);
      const tz = d.getTimezoneOffset() * 60000;
      const local = new Date(d - tz);
      return local.toISOString().slice(0, 16);
    } catch (e) {
      return new Date().toISOString().slice(0, 16);
    }
  };

  const fromInputToIso = (inputValue) => {
    try {
      // inputValue is like '2025-10-20T12:00' in local
      const d = new Date(inputValue);
      return d.toISOString();
    } catch (e) {
      return new Date().toISOString();
    }
  };

  return (
    <TabsContent value="/behavior" className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>إدارة السلوك</CardTitle>
          <CardDescription>تسجيل وإدارة سلوكيات الطالبات</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div>
                  <Label className="block text-sm mb-1">الفصل</Label>
                  <Select value={selectedClass?.id?.toString() || ""} onValueChange={(v) => setSelectedClass(classes.find((c) => c.id?.toString() === v))}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{selectedClass?.className || "اختر الفصل"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Array.isArray(classes) && classes.map((c) => (
                        <SelectItem key={c.id} value={c.id?.toString()}>{c.className}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="block text-sm mb-1">الطالبة</Label>
                  <Select value={selectedStudent?.id?.toString() || ""} onValueChange={(v) => setSelectedStudent(students.find((s) => s.id?.toString() === v))}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{selectedStudent?.name || "اختر الطالبة"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Array.isArray(students) && students.map((s) => (
                        <SelectItem key={s.id} value={s.id?.toString()}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="block text-sm mb-1">نوع السلوك</Label>
                    <Select value={String(form.behaviorType)} onValueChange={(v) => setForm({ ...form, behaviorType: v })}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="اختر نوع السلوك" /></SelectTrigger>
                      <SelectContent>
                        {/* Example mapping - replace/place localize as needed */}
                        {behaviorTypeLabels.map((lbl, idx) => (
                          <SelectItem key={idx} value={String(idx)}>{lbl}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="block text-sm mb-1">التاريخ</Label>
                    <Input name="date" type="datetime-local" value={toLocalInputValue(form.date)} onChange={(e) => setForm({ ...form, date: fromInputToIso(e.target.value) })} className="w-full" />
                  </div>
                </div>

                <div>
                  <Label className="block text-sm mb-1">الوصف</Label>
                  <textarea rows={4} className="w-full border rounded px-3 py-2" name="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>

                <div className="flex gap-3">
                  <Button type="submit" className="bg-blue-500">سجل السلوك</Button>
                  <Button type="button" variant="outline" onClick={() => { setForm({ behaviorType: 0, description: "", date: new Date().toISOString() }); }}>إعادة تعيين</Button>
                </div>
              </form>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3">سجلات السلوك</h3>
              <div className="mb-3 flex items-center gap-3">
                <label className="flex items-center gap-2"><input type="checkbox" checked={showClassWide} onChange={(e) => setShowClassWide(e.target.checked)} /> عرض سجلات الفصل كلها</label>
              </div>
              <div className="space-y-3 max-h-[60vh] overflow-auto">
                {Array.isArray(behaviors) && behaviors.length > 0 ? (
                  behaviors.map((b) => {
                    // Prefer explicit studentName on the behavior record, otherwise try to find in students list
                    const studentName = b.studentName || (Array.isArray(students) && students.find(s => s.id === b.studentId)?.name) || selectedStudent?.name || `ID:${b.studentId || '-'}`;
                    return (
                      <div key={b.id} className="bg-white border rounded p-4 flex flex-col sm:flex-row sm:justify-between gap-3 items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <Badge variant={b.behaviorType === 2 ? "destructive" : b.behaviorType === 1 ? "secondary" : "default"}>{behaviorTypeLabels[b.behaviorType] ?? b.behaviorType}</Badge>
                            <div className="text-sm font-semibold">{studentName}</div>
                          </div>
                          <div className="text-sm text-gray-700 mt-2">{b.description || <span className="text-gray-400">(لا يوجد وصف)</span>}</div>
                          <div className="text-xs text-gray-500 mt-2">{new Date(b.date).toLocaleString()}</div>
                          {b.rollNumber && (<div className="text-xs text-gray-500 mt-1">الرقم: {b.rollNumber}</div>)}
                        </div>
                        <div className="flex items-start">
                          <Button size="sm" variant="ghost" onClick={() => { if (confirm('حذف السجل؟')) deleteBehavior(b.id).then(() => fetchBehaviors(selectedClass.id, selectedStudent?.id)); }}>
                            حذف
                          </Button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-gray-500">لا توجد سجلات سلوك لعرضها.</div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}

export default Behavior;
