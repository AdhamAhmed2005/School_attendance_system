import { createContext, useCallback, useContext, useEffect, useState, useRef } from "react";
import axios from "axios";

// Normalize a Date/ISO string to a date-only key YYYY-MM-DD using local date components.
// This avoids timezone shifts caused by toISOString() and ensures consistent comparisons.
const toDateKey = (d) => {
  try {
    const dt = d ? new Date(d) : new Date();
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    // Fallback to ISO slice if something unexpected is passed
    try {
        return new Date(d).toISOString().slice(0, 10); 
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }
};

const AttendanceContext = createContext();

export const AttendanceProvider = ({ children }) => {
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const initializedDatesRef = useRef(new Set());
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
      // Backend expects numeric month (1-12) and optional year as separate query params.
      // Accept either:
      // - a string 'YYYY-MM' (from <input type="month">), or
      // - an object { year, month } or
      // - a numeric/string month value (1-12)
      if (month) {
        if (typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)) {
          // If callers pass YYYY-MM (from <input type="month">) send only numeric month (1-12)
          // because backend expects ?month=10 (no year) for class-scoped queries.
          const [, m] = month.split('-').map((s) => Number(s));
          if (!Number.isNaN(m)) {
            params.month = m;
          } else {
            params.month = month;
          }
        } else if (typeof month === 'object' && month !== null && (month.month || month.year)) {
          // if object provided, prefer month.month if present
          if (month.month) params.month = month.month;
          else if (month.year) params.month = month.year; // fallback (rare)
        } else {
          params.month = month;
        }
      }

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
      if (!newRecords || newRecords.length === 0) {
        // No attendance rows yet for this class/date — start initializer in background so UI is not blocked
        try {
          if (classId) {
            // fire-and-forget: initializer will merge results into context and emit an event when done
            initializeAttendanceForClass(classId, date || new Date().toISOString()).catch((e) => {
              console.warn("initializeAttendanceForClass (background) failed:", e);
            });
            setAttendanceNotFound(false);
            return [];
          }
        } catch (initErr) {
          console.warn("initializeAttendanceForClass failed during fetchClassAttendanceByDate:", initErr);
          setAttendanceNotFound(true);
          return [];
        }
      }

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
          try {
            console.warn(
              "AttendanceContext.fetchClassAttendanceByDate: 404 - no attendance for class/date",
              { classId, date, status: err.response.status, response: err.response.data }
            );
            if (!window.__attendanceLastRequests) window.__attendanceLastRequests = [];
            window.__attendanceLastRequests.unshift({ ts: Date.now(), method: 'GET', url: '/Attendance/class-attendance-by-date', params: { classId, date }, status: err.response.status, response: err.response.data });
            if (window.__attendanceLastRequests.length > 200) window.__attendanceLastRequests.length = 200;
          } catch (logErr) {
            console.warn('Failed to write diagnostic for 404 fetch', logErr);
          }
          
          // Try to initialize attendance rows automatically when server reports 404
          try {
            if (classId) {
              const created = await initializeAttendanceForClass(classId, date || new Date().toISOString());
              setAttendanceNotFound(false);
              return created || [];
            }
          } catch (initErr) {
            console.warn("initializeAttendanceForClass failed after 404:", initErr);
            setAttendanceNotFound(true);
            return [];
          }
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
    // lightweight logger for outgoing requests (keeps recent N)
    const logReq = (entry) => {
      try {
        if (!window.__attendanceLastRequests) window.__attendanceLastRequests = [];
        window.__attendanceLastRequests.unshift({ ts: Date.now(), ...entry });
        if (window.__attendanceLastRequests.length > 100) window.__attendanceLastRequests.length = 100;
      } catch (e) {
        // ignore logging failures
        console.warn('logReq failed', e);
      }
    };

    try {
      setLoading(true);
      // Accept either an array of records or a wrapper object { dto: [...] }
      const rawList = Array.isArray(attendanceData)
        ? attendanceData
        : attendanceData && attendanceData.dto && Array.isArray(attendanceData.dto)
        ? attendanceData.dto
        : [];

      // Normalize dates
      const normalized = rawList.map((r) => ({
        ...r,
        date: r?.date ? new Date(r.date).toISOString() : new Date().toISOString(),
      }));

      // Group normalized records by classId + date (YYYY-MM-DD) so we can fetch existing server records
      const groups = new Map();
      for (const r of normalized) {
        const dateKey = toDateKey(r.date);
        const groupKey = `${r.classId}::${dateKey}`;
        if (!groups.has(groupKey)) groups.set(groupKey, { classId: r.classId, date: dateKey, items: [] });
        groups.get(groupKey).items.push(r);
      }

      const toUpdate = [];
      const toCreate = [];

      // For each class/date group, fetch server attendance for that date to determine existing ids
      for (const [, group] of groups.entries()) {
        const { classId, date, items } = group;
        let serverRecords = [];
        try {
          const resp = await axios.get("/Attendance/class-attendance-by-date", { params: { classId, date } });
          serverRecords = Array.isArray(resp.data) ? resp.data : resp.data ? [resp.data] : [];
        } catch {
          // If fetching fails, fall back to local state as best-effort
          // Log the fetch error for diagnostics
          try { console.warn('fetchClassAttendanceByDate: fetch failed'); } catch (e) { console.warn('failed logging fetchErr', e); }
          serverRecords = attendanceRecords.filter((rec) => {
            try {
              return rec.classId === classId && toDateKey(rec.date) === date;
            } catch {
              return false;
            }
          });
        }

        // Build lookups of server records by studentId and name
        const lookupByStudent = new Map();
        const lookupByName = new Map();
        for (const sr of serverRecords) {
          const sid = sr.studentId ?? sr.student?.id ?? null;
          if (sid != null) lookupByStudent.set(String(sid), sr);
          const nm = (sr.name ?? sr.student?.name ?? "").trim();
          if (nm) lookupByName.set(nm, sr);
        }

        // Build a full update payload for this class/date: include every server record, merging incoming changes
        for (const sr of serverRecords) {
          try {
            const nm = (sr.name ?? sr.student?.name ?? "").trim();
            // find incoming change for this student if provided
            const incoming = items.find((it) => (it.studentId != null && String(it.studentId) === String(sr.studentId)) || (it.name && String(it.name).trim() === nm));
            toUpdate.push({
              id: sr.id,
              studentId: sr.studentId,
              classId: sr.classId ?? classId,
              date: toDateKey(sr.date ?? date),
              isAbsent: incoming ? !!incoming.isAbsent : !!sr.isAbsent,
              isExcused: incoming ? !!incoming.isExcused : (typeof sr.isExcused === 'boolean' ? sr.isExcused : !!sr.excused),
            });
          } catch {
            // ignore malformed server record
          }
        }

        // Any incoming items not matched to an existing server record should be created
        for (const r of items) {
          const sidKey = r.studentId != null ? String(r.studentId) : null;
          const nameKey = r.name ? String(r.name).trim() : null;
          let matched = false;
          if (sidKey && lookupByStudent.has(sidKey)) matched = true;
          else if (nameKey && lookupByName.has(nameKey)) matched = true;
          if (!matched) {
            // Do NOT create attendance rows using name-only payloads — require studentId to avoid implicit student creation
            if (r.studentId == null) {
              // record skipped attempts for debugging
              setLastErrorDetail((d) => ({ ...(d || {}), phase: 'addAttendance-skip-name-only', attempted: r }));
              setShowDebugPanel(true);
              // skip
              continue;
            }
            toCreate.push({
              studentId: r.studentId,
              classId: r.classId,
              date: toDateKey(r.date),
              isAbsent: !!r.isAbsent,
              isExcused: !!r.isExcused,
            });
          }
        }
      }

      const results = [];

      // First, update existing records in parallel to reduce total latency
      if (toUpdate.length > 0) {
        const updatePromises = toUpdate.map((upd) => {
          // skip invalid ids such as 0 or falsy
          if (!upd.id || String(upd.id).trim() === "0") {
            try {
              if (!window.__attendanceLastRequests) window.__attendanceLastRequests = [];
              window.__attendanceLastRequests.unshift({ ts: Date.now(), skippedUpdate: true, reason: 'invalid-id', payload: upd });
            } catch (e) {
              // eslint-disable-next-line no-console
              console.warn('failed to write skippedUpdate diagnostic', e);
            }
            return Promise.resolve({ skipped: true, payload: upd });
          }
          try {
            logReq({ method: 'PUT', url: `/Attendance/${encodeURIComponent(upd.id)}`, payload: upd });
          } catch (e) {
            console.warn('logReq PUT failed', e);
          }
          return axios.put(`/Attendance/${encodeURIComponent(upd.id)}`, upd)
            .then((resp) => ({ ok: true, returned: resp?.data, id: upd.id }))
            .catch((err) => ({ ok: false, err, payload: upd }));
        });

        const updateResults = await Promise.all(updatePromises);
        const successfulUpdates = [];
        for (const ur of updateResults) {
          if (ur && ur.ok && ur.returned) {
            const single = Array.isArray(ur.returned) ? ur.returned[0] : ur.returned;
            if (single) successfulUpdates.push(single);
            try { logReq({ method: 'PUT:response', url: `/Attendance/${encodeURIComponent(ur.id)}`, response: ur.returned }); } catch (e) { console.warn('logReq PUT:response failed', e); }
          } else if (ur && !ur.ok) {
            try {
              const itemErr = ur.err;
              const axiosJson = typeof itemErr?.toJSON === "function" ? itemErr.toJSON() : undefined;
              const detail = { phase: "addAttendance-update-one", id: ur.payload?.id, payload: ur.payload, axiosError: axiosJson, config: itemErr?.config, status: itemErr?.response?.status, response: itemErr?.response?.data, message: itemErr?.message };
              setLastErrorDetail((d) => ({ ...(d || {}), ...(detail || {}) }));
              setShowDebugPanel(true);
              console.error("Error updating attendance for id", ur.payload?.id, detail);
              try { if (!window.__attendanceLastRequests) window.__attendanceLastRequests = []; window.__attendanceLastRequests.unshift({ ts: Date.now(), method: 'PUT', payload: ur.payload, error: detail }); } catch (e) { console.warn('failed writing PUT error diagnostic', e); }
            } catch (e) {
              console.error('Error handling update failure', e);
            }
          }
        }

        if (successfulUpdates.length > 0) {
          setAttendanceRecords((prev) => {
            const map = new Map(prev.map((r) => [r.id, r]));
            for (const single of successfulUpdates) {
              if (single && single.id) map.set(single.id, single);
            }
            return Array.from(map.values());
          });
          results.push(...successfulUpdates);
        }
      }

      // Then, create missing records one-by-one (backend expects single object POST)
      if (toCreate.length > 0) {
        const createPromises = toCreate.map((c) => {
          // guard: ensure studentId is valid (non-falsy, not '0') before calling POST
          if (!c.studentId || String(c.studentId).trim() === "0") {
            try { logReq({ method: 'POST-skipped', url: '/Attendance', reason: 'invalid-studentId', payload: c }); } catch { console.warn('logReq POST-skipped failed'); }
            setLastErrorDetail((d) => ({ ...(d || {}), phase: 'addAttendance-invalid-studentId', payload: c }));
            setShowDebugPanel(true);
            return Promise.resolve({ skipped: true, payload: c });
          }
          try { logReq({ method: 'POST', url: '/Attendance', payload: c }); } catch { console.warn('logReq POST failed'); }
          return axios.post('/Attendance', c)
            .then((r) => ({ ok: true, returned: r?.data }))
            .catch((postErr) => ({ ok: false, err: postErr, payload: c }));
        });

        const createResults = await Promise.all(createPromises);
        const successfulCreates = [];
        for (const cr of createResults) {
            if (cr && cr.ok && cr.returned) {
            const single = Array.isArray(cr.returned) ? cr.returned[0] : cr.returned;
            if (single) successfulCreates.push(single);
            try { logReq({ method: 'POST:response', url: '/Attendance', response: cr.returned }); } catch { console.warn('logReq POST:response failed'); }
          } else if (cr && !cr.ok) {
            try {
              const postErr = cr.err;
              const resp = postErr?.response;
              console.error("addAttendance: POST failed for create", {
                message: postErr?.message,
                status: resp?.status,
                responseData: resp?.data,
                url: '/Attendance',
                payload: cr.payload,
                config: postErr?.config,
              });
              if (!window.__attendanceLastRequests) window.__attendanceLastRequests = [];
              window.__attendanceLastRequests.unshift({
                ts: Date.now(),
                method: 'POST',
                url: '/Attendance',
                payload: cr.payload,
                errorMessage: postErr?.message,
                status: resp?.status,
                response: resp?.data,
                config: postErr?.config,
              });
              if (window.__attendanceLastRequests.length > 200) window.__attendanceLastRequests.length = 200;
            } catch {
              console.error('Failed writing attendance POST diagnostic');
            }
            setLastErrorDetail((d) => ({ ...(d || {}), phase: "addAttendance-create", payload: cr.payload, message: cr.err?.message, response: cr.err?.response?.data }));
          }
        }

        if (successfulCreates.length > 0) {
          setAttendanceRecords((prev) => {
            const map = new Map(prev.map((rec) => [rec.id, rec]));
            for (const single of successfulCreates) {
              if (single && single.id) map.set(single.id, single);
            }
            return Array.from(map.values());
          });
          results.push(...successfulCreates);
        }
      }

      return results;
    } catch (err) {
      const axiosJson = typeof err?.toJSON === "function" ? err.toJSON() : undefined;
      const detail = {
        phase: "addAttendance-update-multiple",
        payloadPreview: Array.isArray(attendanceData) ? attendanceData.slice(0, 10) : attendanceData,
        axiosError: axiosJson,
        config: err?.config,
        status: err?.response?.status,
        response: err?.response?.data,
        message: err?.message,
      };
      setLastErrorDetail(detail);
      setShowDebugPanel(true);
      console.error("Error updating attendance (update-multiple):", detail);
      setError(err.message || "Failed to update attendance");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [attendanceRecords]);

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
              toDateKey(r.date) === toDateKey(updatedData.date)
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
  const found = attendanceRecords.find((r) => r.studentId === updatedData.studentId && r.classId === updatedData.classId && toDateKey(r.date) === toDateKey(updatedData.date));
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

  // Ensure attendance records exist for all students in a class for a given date.
  // This will call POST /Attendance with a wrapper { dto: [...] } and merge the created records.
  const initializeAttendanceForClass = useCallback(
    async (classId, date = new Date().toISOString()) => {
      const dateKey = toDateKey(date);
      const initKey = `${classId}::${dateKey}`;
      if (initializedDatesRef.current.has(initKey)) return [];
      // mark as initializing
      initializedDatesRef.current.add(initKey);
      try {
        setLoading(true);
        // Fetch students for the class from the API
        const studentsRes = await axios.get(`/Student?classId=${encodeURIComponent(classId)}`);
        const students = Array.isArray(studentsRes.data) ? studentsRes.data : studentsRes.data ? [studentsRes.data] : [];

        if (!students || students.length === 0) return [];

        // Fetch existing server attendance for this class/date
        let serverRecords = [];
        try {
          const resp = await axios.get("/Attendance/class-attendance-by-date", { params: { classId, date: dateKey } });
          serverRecords = Array.isArray(resp.data) ? resp.data : resp.data ? [resp.data] : [];
        } catch (fetchErr) {
          serverRecords = attendanceRecords.filter((rec) => {
            try {
              return rec.classId === classId && toDateKey(rec.date) === dateKey;
            } catch (e) {
              return false;
            }
          });
        }

        const existingByStudent = new Set(serverRecords.map((r) => String(r.studentId ?? r.student?.id ?? "")));

        // Collect students which need creation, but skip any with invalid id or empty name.
        const toCreate = [];
        for (const s of students) {
          const sid = s.id ?? s.studentId ?? null;
          const name = s.name ? String(s.name).trim() : "";
          if (!sid || String(sid).trim() === "0") {
            // skip invalid id
            if (!window.__attendanceLastRequests) window.__attendanceLastRequests = [];
            window.__attendanceLastRequests.unshift({ ts: Date.now(), skippedInitializer: true, reason: 'invalid-studentId', student: s });
            continue;
          }
          if (!name) {
            // skip students without a name to avoid creating blank students
            if (!window.__attendanceLastRequests) window.__attendanceLastRequests = [];
            window.__attendanceLastRequests.unshift({ ts: Date.now(), skippedInitializer: true, reason: 'empty-name', student: s });
            continue;
          }
          if (!existingByStudent.has(String(sid))) toCreate.push(s);
        }

        const created = [];

        // concurrency-limited creation
        const concurrency = 6;
        const runBatch = async (batch) => Promise.all(batch.map(async (s) => {
          try {
            const payload = { studentId: s.id, classId, date: dateKey, isAbsent: false, isExcused: false };
            const r = await axios.post("/Attendance", payload);
            const returned = r?.data;
            if (returned) {
              const single = Array.isArray(returned) ? returned[0] : returned;
              setAttendanceRecords((prev) => {
                const map = new Map(prev.map((rec) => [rec.id, rec]));
                if (single && single.id) map.set(single.id, single);
                return Array.from(map.values());
              });
              created.push(single);
            }
          } catch (postErr) {
            console.warn(`initializeAttendanceForClass: POST failed for student ${s.id}`, postErr?.message || postErr);
            setLastErrorDetail((d) => ({ ...(d || {}), phase: "initializeAttendanceForClass-post", studentId: s.id, message: postErr?.message, response: postErr?.response?.data }));
          }
        }));

        for (let i = 0; i < toCreate.length; i += concurrency) {
          const batch = toCreate.slice(i, i + concurrency);
          // eslint-disable-next-line no-await-in-loop
          await runBatch(batch);
        }

        // emit event
        try {
          window.dispatchEvent(new CustomEvent("attendance:initialized", { detail: { classId, date: dateKey, createdCount: created.length } }));
        } catch {
          // ignore
        }

        return created;
      } catch (err) {
        console.error("initializeAttendanceForClass failed:", err);
        setLastErrorDetail({ phase: "initializeAttendanceForClass", classId, date, message: err?.message, response: err?.response?.data });
        setShowDebugPanel(true);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [attendanceRecords, setAttendanceRecords]
  );

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
        initializeAttendanceForClass,
        updateAttendance,
        deleteAttendance,
      }}
    >
      {children}
    </AttendanceContext.Provider>
  );
};

export const useAttendance = () => useContext(AttendanceContext);