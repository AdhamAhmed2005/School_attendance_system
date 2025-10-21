import { createContext, useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";

const ReportsContext = createContext();

export const ReportsProvider = ({ children }) => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get("/Reports");
      setReports(response.data);
      setError(null);
    } catch (err) {
      console.error("Error fetching reports:", err);
      setError(err.message || "Failed to fetch reports");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReportById = useCallback(async (id) => {
    try {
      setLoading(true);
      const response = await axios.get(`/Reports/${id}`);
      return response.data;
    } catch (err) {
      console.error("Error fetching report by ID:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const addReport = useCallback(async (reportData) => {
    try {
      setLoading(true);
      let response;
      try {
        response = await axios.post("/Reports", reportData);
      } catch (err) {
        console.warn('POST /Reports failed, attempting absolute URL fallback', err);
        // Build an absolute URL from axios.defaults.baseURL (which might be '/api')
        const base = axios.defaults.baseURL || "";
        let absoluteUrl;
        if (/^https?:\/\//i.test(base)) {
          absoluteUrl = base.replace(/\/$/, "") + "/Reports";
        } else {
          // base is relative (like '/api') — join with window.location.origin
          const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin.replace(/\/$/, '') : '';
          const rel = base.startsWith('/') ? base : (`/${base}`);
          absoluteUrl = origin + rel.replace(/\/$/, '') + "/Reports";
        }
        response = await axios.post(absoluteUrl, reportData);
      }
      setReports((prev) => [...prev, response.data]);
      return response.data;
    } catch (err) {
      console.error("Error adding report:", err);
      setError(err.message || "Failed to add report");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const exportReports = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.post("/Reports/export");
      return response.data;
    } catch (err) {
      console.error("Error exporting reports:", err);
      setError(err.message || "Failed to export reports");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteReport = useCallback(async (id) => {
    try {
      setLoading(true);
      await axios.delete(`/Reports/${id}`);
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error("Error deleting report:", err);
      setError(err.message || "Failed to delete report");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  return (
    <ReportsContext.Provider
      value={{
        reports,
        loading,
        error,
        fetchReports,
        fetchReportById,
        addReport,
        exportReports,
        deleteReport,
      }}
    >
      {children}
    </ReportsContext.Provider>
  );
};

export const useReportsContext = () => useContext(ReportsContext);
