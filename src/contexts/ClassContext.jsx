import { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";

const ClassContext = createContext();

export const ClassProvider = ({ children }) => {
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(() => JSON.parse(localStorage.getItem("selectedClass")) || null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchClasses = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get("/Class");
      // Normalize response to an array (some APIs return a single object)
      const data = response?.data;
      const normalized = Array.isArray(data) ? data : (data && typeof data === 'object' ? [data] : []);
      // Normalize academicTerm values for consistency (client-side hygiene)
      const normalizeAcademicTerm = (t) => {
        if (!t && t !== 0) return "";
        let s = String(t).trim();
        // remove extra whitespace
        s = s.replace(/\s+/g, " ");
        // normalize variants like 'الفصل الدراسي الأول' -> 'الفصل الأول'
        s = s.replace(/الفصل\s*الدراس[ىي]*/giu, "الفصل");
        return s.trim();
      };
      const normalizedMapped = normalized.map((c) => ({ ...c, academicTerm: normalizeAcademicTerm(c?.academicTerm) }));
      if (!Array.isArray(data) && data && typeof data === 'object') {
        console.warn('ClassContext.fetchClasses: expected array, got object — wrapping in array', data);
      }
      setClasses(normalizedMapped);
      setError(null);
      return normalized;
    } catch (err) {
      console.error("Error fetching classes:", err);
      setError(err.message || "Failed to fetch classes");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchClassById = useCallback(async (id) => {
    try {
      setLoading(true);
      const response = await axios.get(`/Class/${id}`);
      const data = response.data;
      if (data && typeof data === 'object') {
        const s = (data.academicTerm && String(data.academicTerm).trim()) || "";
        const academicTerm = s.replace(/\s+/g, " ").replace(/الفصل\s*الدراس[ىي]*/giu, "الفصل").trim();
        return { ...data, academicTerm };
      }
      return data;
    } catch (err) {
      console.error("Error fetching class by ID:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const addClass = useCallback(
    async (classData) => {
      try {
        setLoading(true);
        // Normalize academicTerm before sending
        const payload = { ...classData };
        if (payload.academicTerm) payload.academicTerm = String(payload.academicTerm).trim().replace(/\s+/g, " ").replace(/الفصل\s*الدراس[ىي]*/giu, "الفصل").trim();
        const response = await axios.post("/Class", payload);
        if (!response.data || !response.data.id) {
          // If API returned an unexpected shape, refresh the classes list and return the last one
          const refreshed = await fetchClasses();
          if (Array.isArray(refreshed) && refreshed.length > 0) return refreshed[refreshed.length - 1];
          return null;
        }

        setClasses((prev) => [...prev, response.data]);
        return response.data;
      } catch (err) {
        console.error("Error adding class:", err);
        setError(err.message || "Failed to add class");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchClasses]
  );

  const updateClass = useCallback(
    async (id, updatedData) => {
      try {
        setLoading(true);
        // Normalize academicTerm before sending
        const payload = { id, ...updatedData };
        if (payload.academicTerm) payload.academicTerm = String(payload.academicTerm).trim().replace(/\s+/g, " ").replace(/الفصل\s*الدراس[ىي]*/giu, "الفصل").trim();
        const response = await axios.put(`/Class/${id}`, payload);
        if (!response.data || !response.data.id) {
          await fetchClasses();
        } else {
          // normalize returned value as well
          const returned = { ...response.data, academicTerm: String(response.data.academicTerm || "").trim().replace(/\s+/g, " ").replace(/الفصل\s*الدراس[ىي]*/giu, "الفصل").trim() };
          setClasses((prev) => prev.map((c) => (c.id === id ? returned : c)));
        }
      } catch (err) {
        console.error("Error updating class:", err);
        setError(err.message || "Failed to update class");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchClasses]
  );

  const deleteClass = useCallback(async (id) => {
    setLoading(true);
    try {
      try {
        await axios.delete(`/Class/${id}`);
      } catch (firstErr) {
        const rawBase = import.meta.env.VITE_API_BASE_URL ?? "";
        const shouldTryAbsolute = (rawBase && rawBase.length > 0) || !import.meta.env.DEV;
        if (!shouldTryAbsolute) throw firstErr;

        // build absolute URL to try as a fallback
        let absBase = rawBase && rawBase.length > 0
          ? (rawBase.endsWith("/api") ? rawBase.replace(/\/$/, "") : rawBase.replace(/\/$/, "") + "/api")
          : "https://school-discipline.runasp.net/api";
        const url = `${absBase.replace(/\/$/, "")}/Class/${id}`;
        await axios.delete(url);
      }

      // remove locally
      setClasses((prev) => prev.filter((c) => c.id !== id));
      setSelectedClass((prev) => {
        if (prev?.id === id) {
          localStorage.removeItem("selectedClass");
          return null;
        }
        return prev;
      });
    } catch (err) {
      console.error("Error deleting class:", err);
      setError(err?.response?.data?.message || err.message || "Failed to delete class");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedClass) {
      localStorage.setItem("selectedClass", JSON.stringify(selectedClass));
    } else {
      localStorage.removeItem("selectedClass");
    }
  }, [selectedClass]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  // Reconcile any selectedClass persisted in localStorage with freshly fetched classes.
  // If the server-returned (and normalized) class exists, replace selectedClass so the UI
  // immediately reflects normalized academicTerm. If not found, clear selectedClass.
  useEffect(() => {
    if (!classes || classes.length === 0) return;
    if (!selectedClass) return;
    try {
      const matched = classes.find((c) => c.id === selectedClass.id);
      if (matched) {
        // Replace selectedClass if the server version differs (this will update localStorage via the other effect)
        const needReplace = JSON.stringify(matched) !== JSON.stringify(selectedClass);
        if (needReplace) setSelectedClass(matched);
      } else {
        // class no longer exists or changed id; clear saved selection so UI falls back to fresh pick
        setSelectedClass(null);
      }
    } catch (err) {
      // ignore reconciliation errors
      // eslint-disable-next-line no-console
      console.error("Error reconciling selectedClass with server classes:", err);
    }
  }, [classes]);

  return (
    <ClassContext.Provider
      value={{
        classes,
        selectedClass,
        setSelectedClass,
        selectedDate,
        setSelectedDate,
        loading,
        error,
        fetchClasses,
        fetchClassById,
        addClass,
        updateClass,
        deleteClass,
      }}
    >
      {children}
    </ClassContext.Provider>
  );
};

export const useClass = () => useContext(ClassContext);
