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
      if (!Array.isArray(data) && data && typeof data === 'object') {
        console.warn('ClassContext.fetchClasses: expected array, got object — wrapping in array', data);
      }
      setClasses(normalized);
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
      return response.data;
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
        const response = await axios.post("/Class", classData);
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
        const response = await axios.put(`/Class/${id}`, { id, ...updatedData });
        if (!response.data || !response.data.id) {
          await fetchClasses();
        } else {
          setClasses((prev) => prev.map((c) => (c.id === id ? response.data : c)));
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
