import { FORMATEUR_TITRES, titresForCategories } from "./formateurTitres";

describe("titresForCategories", () => {
  test("ne propose que les titres des types de formations choisis", () => {
    expect(titresForCategories(["PERMIS"])).toEqual(["Formateur BAFM", "Psychologue"]);
  });

  test("cumule les titres de plusieurs types de formations", () => {
    expect(titresForCategories(["SSIAP", "PERMIS"])).toEqual(["Formateur BAFM", "Psychologue", "Formateur SSIAP"]);
  });

  test("aucun titre sans type de formation", () => {
    expect(titresForCategories([])).toEqual([]);
  });

  test("le titre du psychologue reste reconnu par la convention (services/pdf.py)", () => {
    expect(FORMATEUR_TITRES.PERMIS.filter((t) => t.toUpperCase().includes("PSY"))).toEqual(["Psychologue"]);
  });

  test("les titres tiennent dans le cartouche de signature (30 caractères, services/pdf.py)", () => {
    Object.values(FORMATEUR_TITRES).flat().forEach((t) => expect(t.length).toBeLessThanOrEqual(30));
  });
});
