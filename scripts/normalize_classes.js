#!/usr/bin/env node
import axios from "axios";

// Usage:
//   node scripts/normalize_classes.js        # dry-run, shows planned updates
//   node scripts/normalize_classes.js --apply  # perform PUT updates

const API_BASE = process.env.API_BASE || process.env.VITE_API_BASE_URL || "https://school-discipline.runasp.net/api";
const DRY_RUN = !process.argv.includes("--apply");

const client = axios.create({ baseURL: API_BASE.replace(/\/$/, "") });

const normalizeAcademicTerm = (t) => {
  if (t === null || t === undefined) return "";
  let s = String(t).trim();
  s = s.replace(/\s+/g, " ");
  // normalize variants like 'الفصل الدراسي الأول' -> 'الفصل الأول'
  s = s.replace(/الفصل\s*الدراس[ىي]*/giu, "الفصل");
  return s.trim();
};

const run = async () => {
  console.log("API base:", API_BASE);
  console.log(DRY_RUN ? "DRY RUN — no changes will be sent. Use --apply to apply updates." : "APPLY MODE — updates will be sent to the server.");

  try {
    const resp = await client.get("/Class");
    const data = resp?.data;
    const classes = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];

    if (classes.length === 0) {
      console.log("No classes returned from /Class");
      return;
    }

    const changes = [];
    for (const c of classes) {
      const before = c?.academicTerm ?? "";
      const after = normalizeAcademicTerm(before);
      if (after !== String(before || "").trim()) {
        changes.push({ id: c.id, before, after, classObj: c });
      }
    }

    if (changes.length === 0) {
      console.log("All classes already normalized. No changes needed.");
      return;
    }

    console.log(`Planned updates: ${changes.length}`);
    for (const ch of changes) {
      console.log(`- id=${ch.id} : "${ch.before}" -> "${ch.after}"`);
    }

    if (DRY_RUN) return;

    // Apply updates sequentially
    for (const ch of changes) {
      const payload = { ...ch.classObj, academicTerm: ch.after };
      try {
        const r = await client.put(`/Class/${ch.id}`, payload);
        console.log(`Updated id=${ch.id} -> ${r.status}`);
      } catch (err) {
        console.error(`Failed to update id=${ch.id}:`, err?.response?.status, err?.message || err);
      }
      // small delay to avoid hammering the server
      await new Promise((res) => setTimeout(res, 120));
    }

    console.log("Done applying updates.");
  } catch (err) {
    console.error("Failed to fetch classes:", err?.message || err);
    process.exit(1);
  }
};

run();
