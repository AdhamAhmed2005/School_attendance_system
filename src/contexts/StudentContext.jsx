import { createContext, useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";

const StudentContext = createContext();

export const StudentProvider = ({ children }) => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
    async (studentsData) => {
      try {
        setLoading(true);
        const response = await axios.post("/Student/import", studentsData);
        await fetchStudents();
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
