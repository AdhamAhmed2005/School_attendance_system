// NOTE: This file exports a context hook and a provider. Fast refresh in dev warns
// when files export non-component values. We keep this file as-is for convenience.
import { createContext, useCallback, useContext, useState } from "react";
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

  // Fetch absence count for a student within a date range. Prefer POST with body
  // { studentId, startDate, endDate, isExcused } as some backends expect a date range.
  const fetchAbsenceCount = useCallback(async (studentId, startDate = null, endDate = null, isExcused = null) => {
    try {
      setLoading(true);
      const payload = { studentId };
      if (startDate) payload.startDate = startDate;
      if (endDate) payload.endDate = endDate;
      // allow explicitly passing isExcused (null means both)
      if (typeof isExcused !== 'undefined') payload.isExcused = isExcused;

      // diagnostic log
      try {
        if (!window.__attendanceLastRequests) window.__attendanceLastRequests = [];
        window.__attendanceLastRequests.unshift({ ts: Date.now(), phase: 'ABSENCE_COUNT_REQUEST', payload });
        if (window.__attendanceLastRequests.length > 200) window.__attendanceLastRequests.length = 200;
      } catch (logErr) { console.warn('failed to push absence-count diag', logErr); }

      // GET endpoint with path studentId and optional query params
      const qs = [];
      if (startDate) qs.push(`startDate=${encodeURIComponent(startDate)}`);
      if (endDate) qs.push(`endDate=${encodeURIComponent(endDate)}`);
      if (typeof isExcused !== 'undefined' && isExcused !== null) qs.push(`isExcused=${encodeURIComponent(isExcused)}`);
      const queryString = qs.length ? `?${qs.join('&')}` : '';
      const url = `/Attendance/absence-count/${encodeURIComponent(studentId)}${queryString}`;
      const response = await axios.get(url);
      const data = response?.data;
      // Normalize: server might return { absenceDaysCount: n } or { count: n } or a raw number
      if (data == null) return 0;
      if (typeof data === 'number') return data;
      if (typeof data === 'object') {
        if (typeof data.absenceDaysCount !== 'undefined') return Number(data.absenceDaysCount) || 0;
        if (typeof data.count !== 'undefined') return Number(data.count) || 0;
        // try common keys
        if (typeof data.total !== 'undefined') return Number(data.total) || 0;
      }
      return Number(data) || 0;
    } catch (err) {
      console.error("Error fetching absence count:", err);
      setError(err?.message || "Failed to fetch absence count");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch class-level monthly absence stats from backend endpoint
  // Example: /Attendance/absence-stats/class/{classId}/month?year=2025&month=10
  const fetchClassMonthlyStats = useCallback(async (classId, year, month) => {
    try {
      setLoading(true);
      if (!classId || !year || !month) return null;
  // Respect axios.defaults.baseURL if present to avoid duplicating '/api'.
  const base = (axios.defaults.baseURL || '').replace(/\/$/, '');
  const path = `/Attendance/absence-stats/class/${encodeURIComponent(classId)}/month?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`;
  const url = base ? path : `/api${path}`;
      // diagnostic: record outgoing request
      try {
        if (!window.__attendanceLastRequests) window.__attendanceLastRequests = [];
        window.__attendanceLastRequests.unshift({ ts: Date.now(), phase: 'CLASS_MONTH_STATS_REQUEST', classId, year, month, url });
        if (window.__attendanceLastRequests.length > 300) window.__attendanceLastRequests.length = 300;
  } catch (warnErr) { console.warn('failed to push CLASS_MONTH_STATS_REQUEST diag', warnErr); }

  const resp = await axios.get(url);
      const data = resp?.data;
      // diagnostic: record response
      try {
        if (!window.__attendanceLastRequests) window.__attendanceLastRequests = [];
        window.__attendanceLastRequests.unshift({ ts: Date.now(), phase: 'CLASS_MONTH_STATS_RESPONSE', classId, year, month, url, status: resp?.status, response: data });
        if (window.__attendanceLastRequests.length > 300) window.__attendanceLastRequests.length = 300;
  } catch (warnErr) { console.warn('failed to push CLASS_MONTH_STATS_RESPONSE diag', warnErr); }
      // Normalize common shapes:
      // - { count3, count5, count10 }
      // - { students: [{ studentId, absentDays }] }
      // - array of { studentId, absentDays }
      if (!data) return null;
      if (typeof data === 'object') {
        // Support multiple possible naming conventions. Map to a consistent shape.
        const mapCount = (obj) => {
          const c3 = obj.count3 ?? obj['3DaysOrMore'] ?? obj.threeDaysOrMore ?? obj['3_days_or_more'];
          const c5 = obj.count5 ?? obj['5DaysOrMore'] ?? obj.fiveDaysOrMore ?? obj['5_days_or_more'];
          const c10 = obj.count10 ?? obj['10DaysOrMore'] ?? obj.tenDaysOrMore ?? obj['10_days_or_more'];
          return {
            count3: typeof c3 !== 'undefined' && c3 != null ? Number(c3) || 0 : undefined,
            count5: typeof c5 !== 'undefined' && c5 != null ? Number(c5) || 0 : undefined,
            count10: typeof c10 !== 'undefined' && c10 != null ? Number(c10) || 0 : undefined,
          };
        };

        const mapped = mapCount(data);
        if (mapped.count3 !== undefined || mapped.count5 !== undefined || mapped.count10 !== undefined) {
          return {
            count3: mapped.count3 ?? 0,
            count5: mapped.count5 ?? 0,
            count10: typeof mapped.count10 !== 'undefined' ? mapped.count10 : undefined,
            students: Array.isArray(data.students) ? data.students : undefined,
          };
        }
        if (Array.isArray(data)) {
          // array of per-student stats
          return { students: data };
        }
        if (Array.isArray(data.students)) {
          return { students: data.students };
        }
      }
      return null;
    } catch (err) {
      // diagnostic: record error
      try {
        if (!window.__attendanceLastRequests) window.__attendanceLastRequests = [];
  window.__attendanceLastRequests.unshift({ ts: Date.now(), phase: 'CLASS_MONTH_STATS_ERROR', classId, year, month, url: `/api/Attendance/absence-stats/class/${classId}/month`, error: (err && err.message) || err });
        if (window.__attendanceLastRequests.length > 300) window.__attendanceLastRequests.length = 300;
  } catch (warnErr) { console.warn('failed to push CLASS_MONTH_STATS_ERROR diag', warnErr); }
      console.error('Error fetching class monthly stats:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch students with no absence for a given class/year/month from server
  // Example: GET https://school-discipline.runasp.net/api/Attendance/students/no-absence?classId={id}&year={year}&month={month}
  const fetchNoAbsenceStudents = useCallback(async (classId, year, month) => {
    try {
      setLoading(true);
      if (!classId || !year || !month) return [];
      // Build URL: respect axios.defaults.baseURL if it's configured
      // The user provided an absolute endpoint; to be safe, we'll call the absolute URL if axios base is not the remote host
      const base = (axios.defaults.baseURL || '').replace(/\/$/, '');
      let urlPath = `/Attendance/students/no-absence?classId=${encodeURIComponent(classId)}&year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`;
      let url = '';
      // If base looks like the production API host that already contains the path, use relative; otherwise prefer the given absolute host
      if (base && base.includes('runasp.net')) {
        url = urlPath;
      } else {
        url = `https://school-discipline.runasp.net/api${urlPath}`;
      }
      const resp = await axios.get(url);
      const data = resp?.data;
      // expect array of student objects or ids
      if (!data) return [];
      if (Array.isArray(data)) return data;
      // if server wraps results, try common keys
      if (data.results && Array.isArray(data.results)) return data.results;
      if (data.students && Array.isArray(data.students)) return data.students;
      return [];
    } catch (err) {
      console.error('Error fetching no-absence students:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch behavior incident stats for a class/month
  // Expected shapes (server may vary):
  // { byCategory: { "شجار": 5, "تأخر": 3 }, timeline: [{ date: '2025-10-01', count: 3 }], total: 8 }
  // or array of { category, count }
  const fetchBehaviorStats = useCallback(async (classId, year, month) => {
    try {
      setLoading(true);
      if (!classId) return null;
      // Build query: the server endpoint is /Behavior?classId=...
      const qs = [`classId=${encodeURIComponent(classId)}`];
      if (year) qs.push(`year=${encodeURIComponent(year)}`);
      if (month) qs.push(`month=${encodeURIComponent(month)}`);
      const query = qs.join('&');
      const path = `/Behavior?${query}`;
      const base = (axios.defaults.baseURL || '').replace(/\/$/, '');
      const url = base ? path : `/api${path}`;
      // diagnostic
      try {
        if (!window.__attendanceLastRequests) window.__attendanceLastRequests = [];
        window.__attendanceLastRequests.unshift({ ts: Date.now(), phase: 'BEHAVIOR_STATS_REQUEST', classId, year, month, url });
        if (window.__attendanceLastRequests.length > 300) window.__attendanceLastRequests.length = 300;
      } catch (diagErr) { console.warn('diag push failed', diagErr); }
      const resp = await axios.get(url);
      const data = resp?.data;
      if (!data) return null;
      // Normalize various shapes into { byCategory: {k:v}, timeline: [{date,count}], total }
  // We'll compute both incident counts and unique-student counts per category.
  const result = { byCategory: {}, byCategoryStudentCount: {}, timeline: [], total: undefined };
  const categoryStudentSets = new Map();
      // If server returns an array, it may be an array of incidents
      if (Array.isArray(data)) {
        // Attempt to detect incidents: objects with date/category fields
        for (const it of data) {
          if (!it) continue;
          const cat = it.category ?? it.behaviorType ?? it.type ?? it.name ?? 'غير معروف';
          const date = it.date ?? it.occurredAt ?? it.createdAt ?? null;
          // detect student identity if present
          const sid = it.studentId ?? it.student?.id ?? it.studentIdNumber ?? it.studentIdentifier ?? it.studentNumber ?? null;
          // count category
          result.byCategory[cat] = (result.byCategory[cat] || 0) + 1;
          if (sid != null) {
            const key = String(sid);
            const set = categoryStudentSets.get(cat) || new Set();
            set.add(key);
            categoryStudentSets.set(cat, set);
          }
          // timeline aggregate by date (YYYY-MM-DD)
          if (date) {
            const d = new Date(date);
            if (!isNaN(d.getTime())) {
              const key = d.toISOString().slice(0, 10);
              const existing = result.timeline.find(t => t.date === key);
              if (existing) existing.count++; else result.timeline.push({ date: key, count: 1 });
            }
          }
        }
        result.total = Object.values(result.byCategory).reduce((a, b) => a + b, 0);
        // build unique-student counts per category
        for (const [k, s] of categoryStudentSets.entries()) {
          result.byCategoryStudentCount[k] = s.size;
        }
        // sort timeline
        result.timeline.sort((a, b) => a.date.localeCompare(b.date));
        return result;
      }

      if (typeof data === 'object') {
        if (data.byCategory && typeof data.byCategory === 'object') {
          result.byCategory = data.byCategory;
          result.timeline = Array.isArray(data.timeline) ? data.timeline : [];
          // if server provides per-category lists of students, compute their sizes
          if (data.byCategoryStudents && typeof data.byCategoryStudents === 'object') {
            for (const k of Object.keys(data.byCategoryStudents)) {
              const val = data.byCategoryStudents[k];
              if (Array.isArray(val)) result.byCategoryStudentCount[k] = val.length;
              else if (typeof val === 'object') result.byCategoryStudentCount[k] = Array.isArray(val.students) ? val.students.length : 0;
            }
          }
          // also accept explicit counts from server
          if (data.byCategoryStudentCount && typeof data.byCategoryStudentCount === 'object') {
            for (const k of Object.keys(data.byCategoryStudentCount)) result.byCategoryStudentCount[k] = Number(data.byCategoryStudentCount[k]) || 0;
          }
          result.total = typeof data.total !== 'undefined' ? Number(data.total) : Object.values(result.byCategory).reduce((a, b) => a + (Number(b) || 0), 0);
          return result;
        }
        // support object of categories directly (e.g. { 'شجار': 5, 'تأخر': 2 })
        const keys = Object.keys(data);
        const allNumbers = keys.length > 0 && keys.every(k => typeof data[k] === 'number' || !isNaN(Number(data[k])));
        if (allNumbers) {
          for (const k of keys) result.byCategory[k] = Number(data[k]) || 0;
          result.total = Object.values(result.byCategory).reduce((a, b) => a + b, 0);
          // since keys are numbers we can't infer student-unique counts here, leave byCategoryStudentCount empty
          return result;
        }
      }
      return null;
    } catch (err) {
      console.error('Error fetching behavior stats:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // NOTE: do not automatically fetch /Reports on mount to avoid calling an endpoint
  // that may not exist in some deployments. Call fetchReports() manually when needed.

  return (
    <ReportsContext.Provider
      value={{
        reports,
        loading,
        error,
        fetchReports,
        fetchReportById,
        addReport,
        fetchAbsenceCount,
  fetchClassMonthlyStats,
  fetchBehaviorStats,
  fetchNoAbsenceStudents,
        exportReports,
        deleteReport,
      }}
    >
      {children}
    </ReportsContext.Provider>
  );
};

export const useReportsContext = () => useContext(ReportsContext);

// default export the provider for compatibility with fast-refresh dev tooling
export default ReportsProvider;
