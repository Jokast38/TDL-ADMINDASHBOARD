import axios from "axios";
import { captureUtmParams, getUtmParams } from "@/lib/utm";

/* =========================
   CONFIG AXIOS UNIQUE
========================= */

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

// Capté une seule fois, au premier chargement de ce module (donc avant tout
// appel API, quelle que soit la page d'entrée) — voir lib/utm.js.
captureUtmParams();

/* =========================
   AUTH INTERCEPTOR
========================= */

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("tdl_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Attribution de campagne (utm_source/utm_campaign/...) — injectée
  // automatiquement sur toute création d'inscription publique plutôt que
  // dans chaque landing page une à une, pour que la mise en place côté
  // Meta Ads (ajout de paramètres d'URL) profite immédiatement à TOUTES
  // les "money pages" existantes et futures. N'écrase jamais une valeur que
  // l'appelant aurait déjà explicitement fournie.
  if (config.method === "post" && config.url === "/inscriptions" && config.data) {
    const utm = getUtmParams();
    config.data = { ...utm, ...config.data };
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