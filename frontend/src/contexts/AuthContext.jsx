import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, formatApiError } from "@/lib/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // null = loading; false = no user; object = user
  const [error, setError] = useState("");

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      setUser(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = async (email, password) => {
    setError("");
    try {
      const { data } = await api.post("/auth/login", { email, password });
      if (data.token) localStorage.setItem("tdl_token", data.token);
      setUser(data.user);
      return data.user;
    } catch (e) {
      const msg = formatApiError(e.response?.data?.detail) || "Erreur de connexion";
      setError(msg);
      throw new Error(msg);
    }
  };

  const register = async (payload) => {
    setError("");
    try {
      const { data } = await api.post("/auth/register", payload);
      if (data.token) localStorage.setItem("tdl_token", data.token);
      setUser(data.user);
      return data.user;
    } catch (e) {
      const msg = formatApiError(e.response?.data?.detail) || "Erreur d'inscription";
      setError(msg);
      throw new Error(msg);
    }
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    localStorage.removeItem("tdl_token");
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, error, login, register, logout, refresh: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
