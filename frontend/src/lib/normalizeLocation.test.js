import { normalizeLocation } from "./normalizeLocation";

describe("normalizeLocation", () => {
  test("regroupe les variantes d'Épinay-sur-Seine", () => {
    expect(normalizeLocation("Épinay-sur-Seine")).toBe("Épinay-sur-Seine");
    expect(normalizeLocation("Epinay-sur-Seine")).toBe("Épinay-sur-Seine");
    expect(normalizeLocation("EPINAY SUR SEINE")).toBe("Épinay-sur-Seine");
    expect(normalizeLocation("Épinay-sur-Seine (93)")).toBe("Épinay-sur-Seine");
    expect(normalizeLocation("Epinay sur seine")).toBe("Épinay-sur-Seine");
  });

  test("regroupe les variantes de Creil", () => {
    expect(normalizeLocation("Creil")).toBe("Creil");
    expect(normalizeLocation("Creil (60)")).toBe("Creil");
    expect(normalizeLocation("CREIL")).toBe("Creil");
  });

  test("reconnaît Paris et En ligne", () => {
    expect(normalizeLocation("Paris")).toBe("Paris");
    expect(normalizeLocation("en ligne")).toBe("En ligne");
    expect(normalizeLocation("Distanciel")).toBe("En ligne");
  });

  test("gère les valeurs vides", () => {
    expect(normalizeLocation("")).toBe("Sans lieu");
    expect(normalizeLocation(null)).toBe("Sans lieu");
    expect(normalizeLocation(undefined)).toBe("Sans lieu");
    expect(normalizeLocation("   ")).toBe("Sans lieu");
  });

  test("reformate proprement une ville inconnue", () => {
    expect(normalizeLocation("pontoise")).toBe("Pontoise");
  });
});
