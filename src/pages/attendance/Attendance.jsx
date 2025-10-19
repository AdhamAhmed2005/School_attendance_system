import { useEffect, useState } from "react";
import { useAttendance } from "@/contexts/AttendanceContext";
import { useClass } from "@/contexts/ClassContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function Attendance() {
  const { fetchClassAttendanceByDate, addAttendance, loading } = useAttendance();
  const { selectedClass, selectedDate } = useClass();
  const [attendanceData, setAttendanceData] = useState([]);

  useEffect(() => {
    const loadAttendance = async () => {
      try {
        if (!selectedClass?.id) {
          setAttendanceData([]);
          return;
        }
        const attendance = await fetchClassAttendanceByDate(selectedClass.id, selectedDate.toLocaleDateString("en-CA"));
        console.log(attendance);

        setAttendanceData(attendance);
      } catch (error) {
        console.error("Error loading attendance:", error);
        setAttendanceData([]);
        toast.error("حدث خطأ أثناء جلب بيانات الحضور، حاول مرة أخرى");
      }
    };

    loadAttendance();
  }, [selectedClass, selectedDate, fetchClassAttendanceByDate]);

  const handleToggle = (studentId) => {
    setAttendanceData((prev) =>
      prev.map((item) => (item.studentId === studentId ? { ...item, isAbsent: !item.isAbsent } : item))
    );
  };

  const handleSave = async () => {
    try {
      if (!selectedClass?.id) {
        toast.error("الرجاء اختيار فصل دراسي أولاً");
        return;
      }

      for (const att of attendanceData) {
        await addAttendance({
          studentId: att.studentId,
          classId: selectedClass.id,
          date: selectedDate.toISOString(),
          isAbsent: att.isAbsent,
        });
      }

      toast.success("تم حفظ الحضور والغياب بنجاح");
    } catch (err) {
      toast.error("حدث خطأ أثناء الحفظ، حاول مرة أخرى");
      console.error(err);
    }
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
                attendanceData && attendanceData.length > 0 ? (
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
                          const current = attendanceData.find((a) => a.studentId === student.studentId);
                          return (
                            <TableRow key={student.studentId}>
                              <TableCell className="flex flex-row-reverse items-center justify-center gap-4">
                                <Switch
                                  checked={!current?.isAbsent}
                                  onCheckedChange={() => handleToggle(student.studentId)}
                                  className="rotate-180"
                                />
                                <span className={`${current?.isAbsent ? "text-red-500" : "text-green-700"} font-bold`}>
                                  {current?.isAbsent ? "غائب" : "حاضر"}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">{student.name}</TableCell>
                              <TableCell className="text-right">{index + 1}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-center text-gray-500 mt-4">لا يوجد طلاب في هذا الفصل.</p>
                )
              ) : (
                <p className="text-center text-gray-500 mt-4">اختر فصلاً لعرض الطلاب.</p>
              )}
            </>
          )}
          {/* Save Button */}
          <div className="flex justify-center pt-4">
            <Button onClick={handleSave} disabled={!selectedClass || loading}>
              حفظ الحضور
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default Attendance;
