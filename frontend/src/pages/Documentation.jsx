import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { WarningCircle, MagnifyingGlass, CaretUp, CaretDown, X } from "@phosphor-icons/react";

const ACTIVE_BG = "#f5a623";
const HIT_BG = "#ffe58f";

// Retire tous les <mark data-doc-search> précédemment insérés et recolle le
// texte d'origine — indispensable avant de relancer une recherche, sinon les
// marquages s'empilent à chaque frappe.
function clearHighlights(doc) {
  doc.querySelectorAll("mark[data-doc-search]").forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    parent.replaceChild(doc.createTextNode(mark.textContent), mark);
    parent.normalize();
  });
}

// Parcourt tous les nœuds texte de la doc (en excluant script/style/les
// marquages existants) et entoure chaque occurrence de la recherche d'un
// <mark> stylé inline — la page documentée n'a pas besoin de connaître la
// recherche, tout est injecté depuis le parent via contentDocument.
function highlightMatches(doc, query) {
  clearHighlights(doc);
  const trimmed = query.trim();
  if (!trimmed) return [];

  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped, "gi");

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const tag = node.parentNode && node.parentNode.nodeName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "MARK" || tag === "TITLE") return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      re.lastIndex = 0;
      return re.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const textNodes = [];
  let current;
  while ((current = walker.nextNode())) textNodes.push(current);

  let hitIndex = 0;
  textNodes.forEach((node) => {
    const text = node.nodeValue;
    re.lastIndex = 0;
    const frag = doc.createDocumentFragment();
    let lastEnd = 0;
    let m;
    while ((m = re.exec(text))) {
      frag.appendChild(doc.createTextNode(text.slice(lastEnd, m.index)));
      const mark = doc.createElement("mark");
      mark.setAttribute("data-doc-search", "true");
      mark.setAttribute("data-hit", String(hitIndex));
      mark.style.background = HIT_BG;
      mark.style.color = "#1c1810";
      mark.style.borderRadius = "2px";
      mark.style.padding = "0 1px";
      mark.textContent = m[0];
      frag.appendChild(mark);
      lastEnd = m.index + m[0].length;
      hitIndex += 1;
      if (m.index === re.lastIndex) re.lastIndex += 1; // évite une boucle infinie sur un match vide
    }
    frag.appendChild(doc.createTextNode(text.slice(lastEnd)));
    node.parentNode.replaceChild(frag, node);
  });

  return Array.from(doc.querySelectorAll("mark[data-doc-search]"));
}

export default function Documentation() {
  const [html, setHtml] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);

  const iframeRef = useRef(null);
  const marksRef = useRef([]);
  const loadedRef = useRef(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    api.get("/docs/technical-documentation", { responseType: "text", transformResponse: [(d) => d] })
      .then(({ data }) => setHtml(data))
      .catch((e) => setError(e.response?.data?.detail || "Impossible de charger la documentation"));
  }, []);

  const setActiveMark = (index, marks) => {
    marks.forEach((m, i) => {
      m.style.background = i === index ? ACTIVE_BG : HIT_BG;
    });
    const target = marks[index];
    if (target) {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  };

  const runSearch = (q) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const marks = highlightMatches(doc, q);
    marksRef.current = marks;
    setMatchCount(marks.length);
    const nextIndex = marks.length ? 0 : -1;
    setActiveIndex(nextIndex);
    if (marks.length) setActiveMark(0, marks);
  };

  const onQueryChange = (v) => {
    setQuery(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(v), 220);
  };

  const goTo = (delta) => {
    const marks = marksRef.current;
    if (!marks.length) return;
    const next = (activeIndex + delta + marks.length) % marks.length;
    setActiveIndex(next);
    setActiveMark(next, marks);
  };

  const clearSearch = () => {
    setQuery("");
    setMatchCount(0);
    setActiveIndex(-1);
    const doc = iframeRef.current?.contentDocument;
    if (doc) clearHighlights(doc);
    marksRef.current = [];
  };

  const onIframeLoad = () => {
    loadedRef.current = true;
    if (query.trim()) runSearch(query);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      goTo(e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape") {
      clearSearch();
    }
  };

  return (
    <div className="space-y-4 h-full flex flex-col" data-testid="documentation-page">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="overline">Réservé aux administrateurs</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Documentation technique</h1>
        </div>

        {html && (
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Rechercher dans la documentation..."
                className="pl-9 pr-8 w-72"
                data-testid="doc-search-input"
              />
              {query && (
                <button
                  onClick={clearSearch}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                  aria-label="Effacer la recherche"
                  data-testid="doc-search-clear"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <span className="text-xs text-gray-400 w-16 text-center tabular-nums" data-testid="doc-search-count">
              {query.trim() ? (matchCount ? `${activeIndex + 1}/${matchCount}` : "0/0") : ""}
            </span>
            <Button variant="outline" size="icon" className="h-9 w-9" disabled={!matchCount} onClick={() => goTo(-1)} aria-label="Résultat précédent" data-testid="doc-search-prev">
              <CaretUp size={14} />
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9" disabled={!matchCount} onClick={() => goTo(1)} aria-label="Résultat suivant" data-testid="doc-search-next">
              <CaretDown size={14} />
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-4">
          <WarningCircle size={18} /> {error}
        </div>
      )}
      {!html && !error && (
        <p className="text-sm text-gray-400 py-8 text-center">Chargement de la documentation...</p>
      )}
      {html && (
        <iframe
          ref={iframeRef}
          title="Documentation technique TDL Formation"
          srcDoc={html}
          onLoad={onIframeLoad}
          className="w-full flex-1 border border-gray-200 rounded-md"
          style={{ minHeight: "80vh" }}
          data-testid="documentation-iframe"
        />
      )}
    </div>
  );
}
