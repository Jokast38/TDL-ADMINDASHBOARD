import { monthKey, monthLabelShort, displayStatus, placesRestantes, fillRatio, isSoonFull } from "./stageHelpers";

describe("monthKey", () => {
  test("regroupe par année-mois", () => {
    expect(monthKey("2026-11-02")).toBe("2026-11");
    expect(monthKey("2026-01-31")).toBe("2026-01");
  });
  test("gère les dates manquantes", () => {
    expect(monthKey("")).toBe("0000-00");
    expect(monthKey(null)).toBe("0000-00");
  });
});

describe("monthLabelShort", () => {
  test("formate un libellé court en français", () => {
    expect(monthLabelShort("2026-11")).toBe("Nov. 2026");
    expect(monthLabelShort("2026-01")).toBe("Jan. 2026");
  });
});

describe("displayStatus", () => {
  test("ne change pas un statut annulé ou complet", () => {
    expect(displayStatus({ statut: "annule", date_fin: "2020-01-01" })).toBe("annule");
    expect(displayStatus({ statut: "complet", date_fin: "2099-01-01" })).toBe("complet");
  });
  test("affiche 'termine' pour une session planifiée déjà passée", () => {
    expect(displayStatus({ statut: "planifie", date_fin: "2000-01-01" })).toBe("termine");
  });
  test("garde le statut tel quel pour une session future", () => {
    expect(displayStatus({ statut: "planifie", date_fin: "2099-01-01" })).toBe("planifie");
  });
});

describe("placesRestantes / fillRatio / isSoonFull", () => {
  test("calcule les places restantes avec réservations externes", () => {
    expect(placesRestantes({ capacite_max: 20, nb_inscrits: 15, external_reserved: 2 })).toBe(3);
  });
  test("ne descend jamais sous 0", () => {
    expect(placesRestantes({ capacite_max: 10, nb_inscrits: 15, external_reserved: 0 })).toBe(0);
  });
  test("calcule le taux de remplissage", () => {
    expect(fillRatio({ capacite_max: 20, nb_inscrits: 10, external_reserved: 0 })).toBe(0.5);
  });
  test("détecte 'bientôt complet' à 3 places ou moins", () => {
    expect(isSoonFull({ capacite_max: 20, nb_inscrits: 18, external_reserved: 0 })).toBe(true);
    expect(isSoonFull({ capacite_max: 20, nb_inscrits: 10, external_reserved: 0 })).toBe(false);
    expect(isSoonFull({ capacite_max: 20, nb_inscrits: 20, external_reserved: 0 })).toBe(false); // complet, pas "bientôt"
  });
});
