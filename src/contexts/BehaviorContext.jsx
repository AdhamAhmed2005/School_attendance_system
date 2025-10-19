import { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";

const BehaviorContext = createContext();

export const BehaviorProvider = ({ children }) => {
  const [behaviors, setBehaviors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchBehaviors = useCallback(async (classId = null, studentId = null) => {
    try {
      setLoading(true);
      const params = {};
      if (classId) params.classId = classId;
      if (studentId) params.studentId = studentId;

      const response = await axios.get("/Behavior", { params });
      setBehaviors(response.data);
      setError(null);
    } catch (err) {
      console.error("Error fetching behaviors:", err);
      setError(err.message || "Failed to fetch behaviors");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBehaviorsByStudent = useCallback(async (studentId) => {
    try {
      setLoading(true);
      const response = await axios.get(`/Behavior/student/${studentId}`);
      return response.data;
    } catch (err) {
      console.error("Error fetching student behaviors:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const addBehavior = useCallback(async (behaviorData) => {
    try {
      setLoading(true);
      const response = await axios.post("/Behavior", behaviorData);
      setBehaviors((prev) => [...prev, response.data]);
      return response.data;
    } catch (err) {
      console.error("Error adding behavior:", err);
      setError(err.message || "Failed to add behavior");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateBehavior = useCallback(async (id, updatedData) => {
    try {
      setLoading(true);
      const response = await axios.put(`/Behavior/${id}`, updatedData);
      setBehaviors((prev) => prev.map((b) => (b.id === id ? response.data : b)));
      return response.data;
    } catch (err) {
      console.error("Error updating behavior:", err);
      setError(err.message || "Failed to update behavior");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteBehavior = useCallback(async (id) => {
    try {
      setLoading(true);
      await axios.delete(`/Behavior/${id}`);
      setBehaviors((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      console.error("Error deleting behavior:", err);
      setError(err.message || "Failed to delete behavior");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBehaviors();
  }, [fetchBehaviors]);

  return (
    <BehaviorContext.Provider
      value={{
        behaviors,
        loading,
        error,
        fetchBehaviors,
        fetchBehaviorsByStudent,
        addBehavior,
        updateBehavior,
        deleteBehavior,
      }}
    >
      {children}
    </BehaviorContext.Provider>
  );
};

export const useBehavior = () => useContext(BehaviorContext);
