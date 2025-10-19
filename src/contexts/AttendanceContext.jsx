import { createContext, useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";

const AttendanceContext = createContext();

export const AttendanceProvider = ({ children }) => {
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAttendance = useCallback(async (classId = null, month = null) => {
    try {
      setLoading(true);
      let url = "/Attendance";

      const params = {};
      if (classId) params.classId = classId;
      if (month) params.month = month;

      const response = await axios.get(url, { params });
      setAttendanceRecords(response.data);
      setError(null);
    } catch (err) {
      console.error("Error fetching attendance:", err);
      setError(err.message || "Failed to fetch attendance");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAttendanceByStudent = useCallback(async (studentId) => {
    try {
      setLoading(true);
      const response = await axios.get(`/Attendance/student/${studentId}`);
      return response.data;
    } catch (err) {
      console.error("Error fetching student attendance:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchClassAttendanceByDate = useCallback(async (classId = null, date = null) => {
    try {
      setLoading(true);
      const response = await axios.get("/Attendance/class-attendance-by-date", {
        params: { classId, date },
      });
      const newRecords = response.data || [];
      setAttendanceRecords((prev) => {
        const existingIds = new Set(prev.map((r) => r.id));
        const unique = newRecords.filter((r) => !existingIds.has(r.id));
        return [...prev, ...unique];
      });
      return newRecords;
    } catch (err) {
      console.error("Error fetching class attendance by date:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const addAttendance = useCallback(async (attendanceData) => {
    try {
      setLoading(true);

      const uniqueData = attendanceData.filter(
        (record, index, self) =>
          index ===
          self.findIndex(
            (r) => r.studentId === record.studentId && r.classId === record.classId && r.date === record.date
          )
      );

      const existing = await axios.get("/Attendance/class-attendance-by-date", {
        params: {
          classId: uniqueData[0]?.classId,
          date: uniqueData[0]?.date,
        },
      });

      const existingMap = new Set(existing.data.map((r) => `${r.studentId}-${r.classId}-${r.date}`));

      const newRecords = uniqueData.filter((r) => !existingMap.has(`${r.studentId}-${r.classId}-${r.date}`));

      if (newRecords.length === 0) {
        console.log("✅ All records already exist — nothing to add.");
        return [];
      }

      const response = await axios.post("/Attendance", newRecords);

      setAttendanceRecords((prev) => {
        const existingKeys = new Set(prev.map((r) => `${r.studentId}-${r.classId}-${r.date}`));
        const filteredNew = response.data.filter((r) => !existingKeys.has(`${r.studentId}-${r.classId}-${r.date}`));
        return [...prev, ...filteredNew];
      });

      return response.data;
    } catch (err) {
      console.error("Error adding attendance:", err);
      setError(err.message || "Failed to add attendance");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateAttendance = useCallback(async (id, updatedData) => {
    try {
      setLoading(true);
      const response = await axios.put(`/Attendance/${id}`, updatedData);
      setAttendanceRecords((prev) => prev.map((rec) => (rec.id === id ? response.data : rec)));
      return response.data;
    } catch (err) {
      console.error("Error updating attendance:", err);
      setError(err.message || "Failed to update attendance");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteAttendance = useCallback(async (id) => {
    try {
      setLoading(true);
      await axios.delete(`/Attendance/${id}`);
      setAttendanceRecords((prev) => prev.filter((rec) => rec.id !== id));
    } catch (err) {
      console.error("Error deleting attendance:", err);
      setError(err.message || "Failed to delete attendance");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  return (
    <AttendanceContext.Provider
      value={{
        attendanceRecords,
        loading,
        error,
        fetchAttendance,
        fetchAttendanceByStudent,
        fetchClassAttendanceByDate,
        addAttendance,
        updateAttendance,
        deleteAttendance,
      }}
    >
      {children}
    </AttendanceContext.Provider>
  );
};

export const useAttendance = () => useContext(AttendanceContext);
