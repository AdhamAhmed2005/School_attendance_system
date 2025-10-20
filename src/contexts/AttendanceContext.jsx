import { createContext, useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";

const AttendanceContext = createContext();

export const AttendanceProvider = ({ children }) => {
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [attendanceNotFound, setAttendanceNotFound] = useState(false);
  const [lastErrorDetail, setLastErrorDetail] = useState(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
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
      const data = response?.data;
      if (Array.isArray(data)) {
        setAttendanceRecords(data);
      } else if (data && typeof data === "object") {
        console.warn("AttendanceContext.fetchAttendance: expected array, got object — wrapping in array", data);
        setAttendanceRecords([data]);
      } else {
        console.warn("AttendanceContext.fetchAttendance: unexpected response data for /Attendance:", data);
        setAttendanceRecords([]);
      }
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
      const newRecords = Array.isArray(response.data) ? response.data : response.data ? [response.data] : [];
      setAttendanceRecords((prev) => {
        const existingIds = new Set(prev.map((r) => r.id));
        const unique = newRecords.filter((r) => !existingIds.has(r.id));
        return [...prev, ...unique];
      });
      // Successfully fetched attendance for this class/date
      setAttendanceNotFound(false);
      return newRecords;
    } catch (err) {
      // If the backend returns 404 for some classes/dates, treat it as "no attendance yet" and
      // return an empty array so the UI can continue to work until the backend is fixed.
      // If backend returns 404 for some classes/dates, set a flag so the UI can show an inline notice
      try {
        if (axios.isAxiosError && axios.isAxiosError(err) && err.response && err.response.status === 404) {
          console.warn(
            "AttendanceContext.fetchClassAttendanceByDate: 404 - no attendance for class/date",
            { classId, date }
          );
          setAttendanceNotFound(true);
          return [];
        }
      } catch (inner) {
        // fall through to normal error handling below
      }
      // For other errors clear the not-found flag, record debug info and rethrow
      setAttendanceNotFound(false);
      const detail = {
        phase: "fetchClassAttendanceByDate",
        classId,
        date,
        config: err?.config,
        status: err?.response?.status,
        response: err?.response?.data,
        message: err?.message,
      };
      setLastErrorDetail(detail);
      console.error("Error fetching class attendance by date:", detail);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const addAttendance = useCallback(async (attendanceData) => {
    try {
      setLoading(true);
      // Accept either an array of records or a wrapper object { dto: [...] }
      const rawList = Array.isArray(attendanceData)
        ? attendanceData
        : attendanceData && attendanceData.dto && Array.isArray(attendanceData.dto)
        ? attendanceData.dto
        : [];

      // Normalize date fields and dedupe by studentId/classId/date
      const normalizedInput = rawList.map((r) => ({
        ...r,
        date: r?.date ? new Date(r.date).toISOString() : new Date().toISOString(),
      }));

      const uniqueData = normalizedInput.filter((record, index, self) =>
        index ===
        self.findIndex((r) => r.studentId === record.studentId && r.classId === record.classId && r.date === record.date)
      );

      if (uniqueData.length === 0) {
        console.log("✅ No new attendance to add");
        return [];
      }

      let existingData = [];
      try {
        const existing = await axios.get("/Attendance/class-attendance-by-date", {
          params: {
            classId: uniqueData[0]?.classId,
            date: uniqueData[0]?.date,
          },
        });
        existingData = Array.isArray(existing.data) ? existing.data : existing.data ? [existing.data] : [];
      } catch (getErr) {
        // If no attendance exists yet for that class/date, backend may return 404 — treat as empty list
        try {
          if (axios.isAxiosError && axios.isAxiosError(getErr) && getErr.response && getErr.response.status === 404) {
            existingData = [];
          } else {
            throw getErr;
          }
        } catch (inner) {
          // rethrow if it's not the 404 case
          throw getErr;
        }
      }

      const existingMap = new Set(existingData.map((r) => `${r.studentId}-${r.classId}-${r.date}`));

      const newRecords = uniqueData.filter((r) => !existingMap.has(`${r.studentId}-${r.classId}-${r.date}`));

      if (newRecords.length === 0) {
        console.log("✅ All records already exist — nothing to add.");
        return [];
      }

      // Try multiple payload shapes and retry on transient 5xx errors.
      // Candidate payloads (order depends on size):
      // - single object (for single-record creates)
      // - wrapper { dto: [...] }
      // - raw array [...]
      const postAttempts = [];
      if (newRecords.length === 1) postAttempts.push(newRecords[0]);
      postAttempts.push({ dto: newRecords });
      postAttempts.push(newRecords);

      // helper: attempt a POST with limited retries on 5xx
      const attemptPostWithRetries = async (payload, maxRetries = 2) => {
        let lastErr = null;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            // eslint-disable-next-line no-console
            console.info("Attempting POST /Attendance", { attempt, payloadPreview: Array.isArray(payload) ? payload.slice(0, 5) : payload });
            const res = await axios.post("/Attendance", payload);
            return res;
          } catch (errAttempt) {
            lastErr = errAttempt;
            const status = errAttempt?.response?.status;
            // only retry for 5xx server errors or network-level issues
            if (status && status >= 500 && status < 600) {
              // exponential backoff
              const wait = 150 * Math.pow(2, attempt);
              // eslint-disable-next-line no-await-in-loop
              await new Promise((r) => setTimeout(r, wait));
              continue;
            }
            // Non-retryable error — rethrow
            throw errAttempt;
          }
        }
        // After retries, throw the last error
        throw lastErr;
      };

      let response;
      let lastAttemptDetail = null;
      for (const candidate of postAttempts) {
        try {
          response = await attemptPostWithRetries(candidate, 2);
          // success - break
          lastAttemptDetail = { payloadType: Array.isArray(candidate) ? "array" : typeof candidate === "object" && candidate.dto ? "wrapper" : "object", payloadPreview: Array.isArray(candidate) ? candidate.slice(0, 5) : candidate };
          break;
        } catch (attemptErr) {
          // record attempt detail and try next candidate
          lastAttemptDetail = { error: attemptErr?.toJSON ? attemptErr.toJSON() : attemptErr, candidatePreview: Array.isArray(candidate) ? candidate.slice(0, 5) : candidate };
          // continue to next candidate
        }
      }

      if (!response) {
        // If no candidate succeeded, throw a composed error so diagnostics include attempted shapes
        const composed = new Error("All POST /Attendance attempts failed");
        composed.attempts = lastAttemptDetail;
        throw composed;
      }

      setAttendanceRecords((prev) => {
        const existingKeys = new Set(prev.map((r) => `${r.studentId}-${r.classId}-${r.date}`));
        const filteredNew = response.data.filter((r) => !existingKeys.has(`${r.studentId}-${r.classId}-${r.date}`));
        return [...prev, ...filteredNew];
      });

      return response.data;
    } catch (err) {
      // Capture extra diagnostics for server 500; axios errors can be empty on network failures
      const axiosJson = typeof err?.toJSON === "function" ? err.toJSON() : undefined;
      const detail = {
        phase: "addAttendance",
        payloadPreview: Array.isArray(attendanceData) ? attendanceData.slice(0, 10) : attendanceData,
        axiosError: axiosJson,
        config: err?.config,
        status: err?.response?.status,
        response: err?.response?.data,
        responseHeaders: err?.response?.headers,
        request: err?.request,
        message: err?.message,
      };
      setLastErrorDetail(detail);
      // Show the debug panel in the UI so developer can copy diagnostics
      setShowDebugPanel(true);
      // eslint-disable-next-line no-console
      console.error("Error adding attendance:", detail);
      setError(err.message || "Failed to add attendance");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateAttendance = useCallback(async (id, updatedData) => {
    try {
      setLoading(true);
      // If no numeric id provided, attempt to find a matching record locally and use its id.
      let useId = id;
      if (!useId) {
        const match = attendanceRecords.find((r) => {
          try {
            return (
              (r.studentId === updatedData.studentId || r.studentId === updatedData.studentId) &&
              (r.classId === updatedData.classId || r.classId === updatedData.classId) &&
              (new Date(r.date).toISOString().slice(0, 10) === new Date(updatedData.date).toISOString().slice(0, 10))
            );
          } catch (e) {
            return false;
          }
        });
        if (match && match.id) useId = match.id;
      }

      let response;
      if (useId) {
        // Prefer PUT for updates to an existing attendance record (server may require PUT at /Attendance/{id})
        const body = { id: useId, ...updatedData };
        try {
          response = await axios.put(`/Attendance/${useId}`, body);
        } catch (putErr) {
          // If PUT fails, try POST as a fallback (upsert via POST)
          const fallbackDetail = { phase: "updateAttendance-put-fallback-to-post", id: useId, body, putError: putErr?.toJSON ? putErr.toJSON() : putErr };
          setLastErrorDetail((d) => ({ ...(d || {}), ...fallbackDetail }));
          try {
            response = await axios.post("/Attendance", body);
          } catch (postErr) {
            // rethrow the original putErr for diagnostics
            throw putErr;
          }
        }
      } else {
        // If no id available, fall back to adding/upserting this single record via addAttendance
        // This will POST { dto: [updatedData] } and let the backend create the record.
        await addAttendance([updatedData]);
        // Fetch the latest attendance for this student/class/date from server or local state
        // We won't rely on the response here; attempt to find the created record in local state
        const found = attendanceRecords.find((r) => r.studentId === updatedData.studentId && r.classId === updatedData.classId && new Date(r.date).toISOString().slice(0,10) === new Date(updatedData.date).toISOString().slice(0,10));
        if (found && found.id) {
          useId = found.id;
          response = { data: found };
        } else {
          // No id yet; construct a best-effort updated object
          response = { data: { ...updatedData } };
        }
      }

      // Normalize response: backend might return the updated object, an array, or 204 No Content.
      let updated = null;
      if (response && response.data) {
        updated = Array.isArray(response.data) ? response.data[0] : response.data;
      }

      // If server returned 204 or no body, fall back to the updatedData with the id.
      if (!updated) {
        updated = { ...updatedData, id };
      }

      setAttendanceRecords((prev) => prev.map((rec) => (rec.id === id ? updated : rec)));
      return updated;
    } catch (err) {
      const detail = {
        phase: "updateAttendance",
        id,
        payloadPreview: updatedData,
        config: err?.config,
        status: err?.response?.status,
        response: err?.response?.data,
        message: err?.message,
      };
      setLastErrorDetail(detail);
      console.error("Error updating attendance:", detail);
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
        attendanceNotFound,
        lastErrorDetail,
        showDebugPanel,
        setShowDebugPanel,
        clearLastError: () => setLastErrorDetail(null),
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
