import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";

function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || "/attendance";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const r = await login(username.trim(), password);
      if (r.ok) {
        navigate(from, { replace: true });
      } else {
        setError(r.error || "Login failed");
      }
    } catch {
      setError("Login error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-8 bg-white p-6 rounded shadow">
      <h2 className="text-xl font-bold mb-4">تسجيل الدخول</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm">اسم المستخدم</label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm">كلمة المرور</label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <div className="flex justify-end">
          <Button type="submit" disabled={loading}>
            {loading ? "جاري..." : "تسجيل الدخول"}
          </Button>
        </div>
      </form>
      <p className="mt-4 text-xs text-gray-500">ملاحظة: هذا تسجيل دخول تجريبي على فرع الاختبار.</p>
    </div>
  );
}

export default Login;
