import React, { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem("sd_user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem("sd_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("sd_user");
    }
  }, [user]);

  const login = async (username, password) => {
    // Simple test-only authentication for the feature/login-testing branch.
    // Prefer environment-provided test creds but fall back to a default pair.
    // Default test credentials for this feature branch. Can still be overridden
    // by setting VITE_TEST_USER / VITE_TEST_PASS in your environment.
    const envUser = import.meta.env.VITE_TEST_USER ?? "AfafHuwail";
    const envPass = import.meta.env.VITE_TEST_PASS ?? "Afaf123789";

    // In a real implementation we'd POST to the backend and receive a token.
    // Make username comparison case-insensitive and tolerant of surrounding whitespace.
    const provided = (username || "").trim();
    const providedLower = provided.toLowerCase();
    const envUserLower = String(envUser).toLowerCase();

    if (providedLower === envUserLower && password === envPass) {
      // Store canonical username (from env) so the displayed username is consistent.
      const u = { username: envUser };
      setUser(u);
      return { ok: true, user: u };
    }

    return { ok: false, error: "Invalid credentials" };
  };

  const logout = () => {
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export default AuthContext;
