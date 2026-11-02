import { api, SESSION_EXPIRED_EVENT } from "./api";

// Le Jest de CRA ne transforme pas node_modules (axios doit être chargé dans
// sa version CommonJS) et ne connaît pas l'alias "@/" de craco.config.js.
jest.mock("axios", () => require("axios/dist/node/axios.cjs"));
jest.mock("@/lib/utm", () => ({ captureUtmParams: jest.fn(), getUtmParams: () => ({}) }), { virtual: true });

const respondWith = (status, detail) => {
  api.defaults.adapter = (config) => Promise.reject({ config, response: { status, data: { detail } } });
};

describe("session expirée", () => {
  let onExpired;

  beforeEach(() => {
    localStorage.clear();
    onExpired = jest.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
  });

  afterEach(() => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired));

  test("un token expiré déconnecte et remplace le message technique", async () => {
    localStorage.setItem("tdl_token", "vieux-token");
    respondWith(401, "Token expiré");
    const error = await api.put("/leads/1", { notes: "x" }).catch((e) => e);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("tdl_token")).toBeNull();
    expect(error.response.data.detail).toBe("Session expirée, veuillez vous reconnecter.");
  });

  test.each(["Mot de passe actuel incorrect", "Identifiants invalides", "WooCommerce: clés API invalides"])(
    "un 401 sans rapport avec la session ne déconnecte pas : %s",
    async (detail) => {
      localStorage.setItem("tdl_token", "token-valide");
      respondWith(401, detail);
      const error = await api.post("/auth/change-password", {}).catch((e) => e);
      expect(onExpired).not.toHaveBeenCalled();
      expect(localStorage.getItem("tdl_token")).toBe("token-valide");
      expect(error.response.data.detail).toBe(detail);
    }
  );

  test("un 403 ne déconnecte pas", async () => {
    localStorage.setItem("tdl_token", "token-valide");
    respondWith(403, "Accès refusé");
    await api.get("/leads").catch((e) => e);
    expect(onExpired).not.toHaveBeenCalled();
  });

  test("un visiteur sans token n'est pas considéré comme déconnecté", async () => {
    respondWith(401, "Non authentifié");
    await api.get("/auth/me").catch((e) => e);
    expect(onExpired).not.toHaveBeenCalled();
  });
});
