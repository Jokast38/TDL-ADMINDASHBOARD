import axios from "axios";

/* =========================
   CONFIG AXIOS UNIQUE
========================= */

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

/* =========================
   AUTH INTERCEPTOR
========================= */

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("tdl_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

/* =========================
   ERROR FORMATTER
========================= */

export const formatApiError = (detail) => {
  if (detail == null) return "Une erreur est survenue.";
  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    return detail
      .map((e) => (e?.msg ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  }

  if (detail?.msg) return detail.msg;

  return String(detail);
};

/* =========================
   DASHBOARD
========================= */

export const getDashboardData = async () => {
  const { data } = await api.get("/dashboard");
  return data;
};

/* =========================
   WORDPRESS ANALYTICS
========================= */

export const getWordpressAnalytics = async () => {
  const { data } = await api.get("/wordpress/stats");
  return data;
};

/* =========================
   USERS
========================= */

export const getUsers = async () => {
  const { data } = await api.get("/users");
  return data;
};

export const createUser = async (payload) => {
  const { data } = await api.post("/users", payload);
  return data;
};