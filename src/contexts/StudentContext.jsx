import { createContext, useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";

const StudentContext = createContext();

export const StudentProvider = ({ children }) => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Defensive interceptor: block any POST to /Student that would create a student with an empty name.
  useEffect(() => {
    const interceptor = axios.interceptors.request.use((config) => {
      try {
        if (config && config.method && config.method.toLowerCase() === 'post' && typeof config.url === 'string' && config.url.includes('/Student')) {
          // Dev/testing strict block: set window.__blockStudentCreates = true in the console to forcefully block any POST to /Student
          if (window.__blockStudentCreates) {
            if (!window.__attendanceLastRequests) window.__attendanceLastRequests = [];
            window.__attendanceLastRequests.unshift({ ts: Date.now(), blockedByFlag: true, url: config.url, payload: config.data });
            return Promise.reject(new Error('Blocked student creation by dev flag: window.__blockStudentCreates'));
          }
          const body = config.data;
          // handle both single object and array for imports
          if (Array.isArray(body)) {
            const invalid = body.filter((s) => !s || !s.name || !String(s.name).trim());
            if (invalid.length > 0) {
              if (!window.__attendanceLastRequests) window.__attendanceLastRequests = [];
              window.__attendanceLastRequests.unshift({ ts: Date.now(), blocked: true, url: config.url, reason: 'empty-names-in-import', invalidCount: invalid.length, payload: body });
              return Promise.reject(new Error('منع إنشاء طلاب بأسماء فارغة'));
            }
          } else if (body && typeof body === 'object') {
            if (!body.name || !String(body.name).trim()) {
              if (!window.__attendanceLastRequests) window.__attendanceLastRequests = [];
              window.__attendanceLastRequests.unshift({ ts: Date.now(), blocked: true, url: config.url, reason: 'empty-name', payload: body });
              return Promise.reject(new Error('منع إنشاء طالب بدون اسم'));
            }
          }
        }
      } catch (e) {
        // ignore
      }
      return config;
    }, (err) => Promise.reject(err));

    return () => axios.interceptors.request.eject(interceptor);
  }, []);

  const fetchStudents = useCallback(async (classId = null) => {
    try {
      setLoading(true);
  const url = classId ? `/Student?classId=${classId}` : "/Student";
      const response = await axios.get(url);
      // Normalize response to an array to avoid runtime errors if API returns single object
      const data = response?.data;
      if (Array.isArray(data)) {
        setStudents(data);
      } else if (data && typeof data === "object") {
        console.warn("StudentContext.fetchStudents: expected array, got object — wrapping in array", data);
        setStudents([data]);
      } else {
        console.warn("StudentContext.fetchStudents: unexpected response data for /Student:", data);
        setStudents([]);
      }
      setError(null);
  return response.data;
    } catch (err) {
      console.error("Error fetching students:", err);
      setError(err.message || "Failed to fetch students");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStudentById = useCallback(async (id) => {
    try {
      setLoading(true);
  const response = await axios.get(`/Student/${id}`);
      return response.data;
    } catch (err) {
      console.error("Error fetching student by ID:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const addStudent = useCallback(async (studentData) => {
    try {
      setLoading(true);
      // Validate student name to prevent creating blank students
      if (!studentData || !studentData.name || !String(studentData.name).trim()) {
        const msg = "لا يمكن إضافة طالب بدون اسم";
        console.error(msg, studentData);
        setError(msg);
        throw new Error(msg);
      }
  const response = await axios.post("/Student", studentData);
      // Normalize response and append
      const data = response?.data;
      if (Array.isArray(data)) {
        setStudents((prev) => [...prev, ...data]);
      } else if (data) {
        setStudents((prev) => [...prev, data]);
      }
      return response.data;
    } catch (err) {
      console.error("Error adding student:", err);
      setError(err.message || "Failed to add student");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const importStudents = useCallback(
    async (studentsData, opts = {}) => {
      try {
        setLoading(true);
        // Validate all students have non-empty names
        const invalid = (studentsData || []).filter((s) => !s || !s.name || !String(s.name).trim());
        if (invalid.length > 0) {
          const msg = `منع استيراد ${invalid.length} صفاً لأن الأسماء فارغة`; 
          console.error(msg, invalid);
          setError(msg);
          throw new Error(msg);
        }
  const response = await axios.post("/Student/import", studentsData);
        // If caller provided a classId, refresh only that class roster for a faster update
        const classId = opts.classId ?? null;
        if (classId) {
          await fetchStudents(classId);
        } else {
          await fetchStudents();
        }
        return response.data;
      } catch (err) {
        console.error("Error importing students:", err);
        setError(err.message || "Failed to import students");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchStudents]
  );

  const updateStudent = useCallback(async (id, updatedData) => {
    try {
      setLoading(true);
  const response = await axios.put(`/Student/${id}`, updatedData);
      setStudents((prev) => prev.map((s) => (s.id === id ? response.data : s)));
      return response.data;
    } catch (err) {
      console.error("Error updating student:", err);
      setError(err.message || "Failed to update student");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteStudent = useCallback(async (id) => {
    try {
      setLoading(true);
  await axios.delete(`/Student/${id}`);
      setStudents((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error("Error deleting student:", err);
      setError(err.message || "Failed to delete student");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  return (
    <StudentContext.Provider
      value={{
        students,
        loading,
        error,
        fetchStudents,
        fetchStudentById,
        addStudent,
        importStudents,
        updateStudent,
        deleteStudent,
      }}
    >
      {children}
    </StudentContext.Provider>
  );
};

export const useStudent = () => useContext(StudentContext);
