import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  EnvelopeSimple, EnvelopeOpen, PaperPlaneTilt, Paperclip, DownloadSimple,
  Plus, ArrowClockwise, ArrowLeft, ArrowRight, X,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const PAGE_SIZE = 25;

// Boîte de messagerie interne (contact@tdl-formation.fr) — réception et
// envoi via services/mailbox.py (IMAP + SMTP o2switch), distincte des
// envois automatiques transactionnels (Brevo, voir services/email.py).
export default function Mailbox() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [folder, setFolder] = useState("inbox");
  const [messages, setMessages] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [selected, setSelected] = useState(null); // { uid } résumé cliqué
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  useEffect(() => {
    api.get("/mailbox/status").then((r) => setConfigured(r.data.configured)).catch(() => setConfigured(false));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/mailbox/${folder}`, { params: { limit: PAGE_SIZE, offset } })
      .then((r) => { setMessages(r.data.messages); setTotal(r.data.total); })
      .catch((e) => toast.error(e.response?.data?.detail || "Erreur de chargement de la messagerie"))
      .finally(() => setLoading(false));
  }, [folder, offset]);

  useEffect(() => { if (configured) load(); }, [configured, load]);

  useEffect(() => {
    // Ouvre directement le compositeur pré-rempli si on arrive depuis une
    // fiche apprenant/lead (ex: lien "Envoyer un email" -> /admin/messagerie?to=...&nom=...).
    if (searchParams.get("to")) setComposeOpen(true);
  }, [searchParams]);

  const openMessage = async (m) => {
    setSelected(m);
    setDetailLoading(true);
    setDetail(null);
    try {
      const r = await api.get(`/mailbox/${folder}/${m.uid}`);
      setDetail(r.data);
      if (folder === "inbox" && !m.seen) {
        setMessages((prev) => prev.map((x) => (x.uid === m.uid ? { ...x, seen: true } : x)));
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de l'ouverture du message");
    } finally {
      setDetailLoading(false);
    }
  };

  const downloadAttachment = async (uid, part) => {
    try {
      const res = await api.get(`/mailbox/${folder}/${uid}/attachment/${part.part_index}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = part.filename; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Erreur de téléchargement");
    }
  };

  const changeFolder = (f) => { setFolder(f); setOffset(0); setSelected(null); setDetail(null); };

  if (!configured) {
    return (
      <Card className="p-12 text-center border-dashed">
        <EnvelopeSimple size={32} className="mx-auto mb-3 text-gray-300" />
        <h2 className="font-display text-xl font-bold mb-1">Messagerie non configurée</h2>
        <p className="text-gray-500 text-sm">
          Variables manquantes côté serveur : IMAP_HOST, SMTP2_HOST, MAILBOX_USER, MAILBOX_PASSWORD.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="mailbox-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="overline">Messagerie</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">contact@tdl-formation.fr</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} data-testid="mailbox-refresh">
            <ArrowClockwise size={16} className={loading ? "animate-spin" : ""} />
          </Button>
          <Button className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" onClick={() => setComposeOpen(true)} data-testid="mailbox-compose-btn">
            <Plus size={16} className="mr-1" /> Nouveau message
          </Button>
        </div>
      </div>

      <Tabs value={folder} onValueChange={changeFolder}>
        <TabsList>
          <TabsTrigger value="inbox" data-testid="mailbox-tab-inbox">Réception</TabsTrigger>
          <TabsTrigger value="sent" data-testid="mailbox-tab-sent">Envoyés</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid lg:grid-cols-[380px_1fr] gap-4 items-start">
        <Card className="border border-gray-200 rounded-md shadow-none overflow-hidden">
          <div className="divide-y divide-gray-100 max-h-[70vh] overflow-y-auto">
            {loading && !messages.length && <div className="p-6 text-center text-gray-400 text-sm">Chargement...</div>}
            {!loading && !messages.length && <div className="p-6 text-center text-gray-400 text-sm">Aucun message.</div>}
            {messages.map((m) => (
              <button
                key={m.uid}
                onClick={() => openMessage(m)}
                data-testid={`mailbox-msg-${m.uid}`}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${selected?.uid === m.uid ? "bg-gray-50" : ""}`}
              >
                <div className="flex items-center gap-2">
                  {m.seen ? <EnvelopeOpen size={14} className="text-gray-300 shrink-0" /> : <EnvelopeSimple size={14} className="text-[#d4af37] shrink-0" />}
                  <span className={`text-sm truncate ${!m.seen ? "font-bold" : "font-medium"}`}>
                    {folder === "inbox" ? m.from : m.to}
                  </span>
                </div>
                <p className={`text-sm mt-0.5 truncate ${!m.seen ? "font-semibold text-gray-900" : "text-gray-600"}`}>{m.subject}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{m.date ? new Date(m.date).toLocaleString("fr-FR") : ""}</p>
              </button>
            ))}
          </div>
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 text-xs text-gray-500">
              <span>{offset + 1}–{Math.min(offset + PAGE_SIZE, total)} sur {total}</span>
              <div className="flex gap-1">
                <Button size="icon" variant="outline" className="h-7 w-7" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                  <ArrowLeft size={12} />
                </Button>
                <Button size="icon" variant="outline" className="h-7 w-7" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>
                  <ArrowRight size={12} />
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card className="border border-gray-200 rounded-md shadow-none p-6 min-h-[300px]">
          {!selected && <div className="text-center text-gray-400 text-sm py-16">Sélectionnez un message pour l'afficher.</div>}
          {selected && detailLoading && <div className="text-center text-gray-400 text-sm py-16">Chargement...</div>}
          {selected && !detailLoading && detail && (
            <div data-testid="mailbox-detail">
              <h2 className="font-display text-xl font-bold mb-2">{detail.subject}</h2>
              <div className="text-xs text-gray-500 space-y-0.5 mb-4 pb-4 border-b border-gray-100">
                <p><strong>De :</strong> {detail.from}</p>
                <p><strong>À :</strong> {detail.to}</p>
                {detail.cc && <p><strong>Cc :</strong> {detail.cc}</p>}
                <p>{detail.date ? new Date(detail.date).toLocaleString("fr-FR") : ""}</p>
              </div>
              {detail.body_html ? (
                <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: detail.body_html }} />
              ) : (
                <p className="whitespace-pre-wrap text-sm text-gray-700">{detail.body_text || "(message vide)"}</p>
              )}
              {!!detail.attachments?.length && (
                <div className="mt-6 pt-4 border-t border-gray-100">
                  <p className="text-xs font-mono uppercase tracking-wider text-gray-500 mb-2">Pièces jointes ({detail.attachments.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {detail.attachments.map((a) => (
                      <button
                        key={a.part_index}
                        onClick={() => downloadAttachment(detail.uid, a)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-gray-200 hover:border-[#d4af37] hover:text-[#d4af37] transition-colors"
                      >
                        <Paperclip size={12} /> {a.filename} <DownloadSimple size={12} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <ComposeDialog
        open={composeOpen}
        onOpenChange={(v) => {
          setComposeOpen(v);
          if (!v && searchParams.get("to")) {
            const next = new URLSearchParams(searchParams);
            next.delete("to"); next.delete("nom"); next.delete("subject");
            setSearchParams(next, { replace: true });
          }
        }}
        onSent={() => { if (folder === "sent") load(); }}
        prefill={{
          to: searchParams.get("to") || "",
          subject: searchParams.get("subject") || "",
          // Texte simple (pas de balises) : le compositeur envoie du texte
          // brut, mis en forme et habillé du gabarit TDL côté serveur
          // (render_branded_email) au moment de l'envoi.
          body: searchParams.get("nom") ? `Bonjour ${searchParams.get("nom")},\n\n` : "",
        }}
      />
    </div>
  );
}

function ComposeDialog({ open, onOpenChange, onSent, prefill }) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [showButton, setShowButton] = useState(false);
  const [buttonLabel, setButtonLabel] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const [files, setFiles] = useState([]);
  const [libraryDocs, setLibraryDocs] = useState([]);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setTo(prefill.to); setSubject(prefill.subject); setBody(prefill.body);
      setCc(""); setFiles([]); setSelectedLibraryIds([]); setShowLibrary(false);
      setShowButton(false); setButtonLabel(""); setButtonUrl("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const openLibrary = () => {
    setShowLibrary(true);
    if (!libraryDocs.length) {
      api.get("/mailbox/library/documents").then((r) => setLibraryDocs(r.data)).catch(() => toast.error("Erreur de chargement de la bibliothèque"));
    }
  };

  const toggleLibraryDoc = (id) => {
    setSelectedLibraryIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const send = async () => {
    if (!to.trim()) return toast.error("Destinataire requis");
    if (!subject.trim()) return toast.error("Objet requis");
    if (showButton && (!buttonLabel.trim() || !buttonUrl.trim())) {
      return toast.error("Renseignez le texte et le lien du bouton, ou décochez-le");
    }
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("to", to.trim());
      fd.append("cc", cc.trim());
      fd.append("subject", subject.trim());
      fd.append("body", body);
      if (showButton) {
        fd.append("button_label", buttonLabel.trim());
        fd.append("button_url", buttonUrl.trim());
      }
      fd.append("library_document_ids", selectedLibraryIds.join(","));
      files.forEach((f) => fd.append("files", f));
      await api.post("/mailbox/send", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Message envoyé");
      onSent?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Échec de l'envoi");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Nouveau message</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <Input placeholder="À" value={to} onChange={(e) => setTo(e.target.value)} data-testid="compose-to" />
          <Input placeholder="Cc (facultatif, séparés par des virgules)" value={cc} onChange={(e) => setCc(e.target.value)} data-testid="compose-cc" />
          <Input placeholder="Objet" value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="compose-subject" />
          <Textarea rows={8} placeholder="Votre message..." value={body} onChange={(e) => setBody(e.target.value)} data-testid="compose-body" />
          <p className="text-[11px] text-gray-400 -mt-2">
            Texte simple — l'email envoyé reprend automatiquement l'habillage TDL Formation (logo, signature, pied de page).
          </p>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="inline-block">
                <input type="file" multiple className="hidden" onChange={(e) => setFiles([...files, ...Array.from(e.target.files || [])])} />
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-gray-200 hover:border-[#d4af37] hover:text-[#d4af37] transition-colors cursor-pointer">
                  <Paperclip size={12} /> Joindre un fichier
                </span>
              </label>
              <button
                type="button"
                onClick={openLibrary}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-gray-200 hover:border-[#d4af37] hover:text-[#d4af37] transition-colors"
              >
                <Paperclip size={12} /> Depuis la bibliothèque {selectedLibraryIds.length > 0 && `(${selectedLibraryIds.length})`}
              </button>
              <button
                type="button"
                onClick={() => setShowButton((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors ${showButton ? "border-[#d4af37] text-[#d4af37]" : "border-gray-200 hover:border-[#d4af37] hover:text-[#d4af37]"}`}
                data-testid="compose-toggle-button"
              >
                <Plus size={12} /> Bouton d'action
              </button>
            </div>

            {showButton && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Input placeholder="Texte du bouton (ex: Voir ma formation)" value={buttonLabel} onChange={(e) => setButtonLabel(e.target.value)} data-testid="compose-button-label" />
                <Input placeholder="Lien du bouton (https://...)" value={buttonUrl} onChange={(e) => setButtonUrl(e.target.value)} data-testid="compose-button-url" />
              </div>
            )}

            {files.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {files.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-gray-100">
                    {f.name}
                    <button onClick={() => setFiles(files.filter((_, idx) => idx !== i))}><X size={10} /></button>
                  </span>
                ))}
              </div>
            )}

            {showLibrary && (
              <div className="mt-3 border border-gray-200 rounded-md max-h-48 overflow-y-auto">
                {!libraryDocs.length && <p className="p-3 text-xs text-gray-400">Aucun document dans la bibliothèque.</p>}
                {libraryDocs.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0">
                    <Checkbox checked={selectedLibraryIds.includes(d.id)} onCheckedChange={() => toggleLibraryDoc(d.id)} />
                    {d.nom}
                    <span className="text-gray-400 text-xs">({d.original_filename})</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={send} disabled={sending} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="compose-send">
            <PaperPlaneTilt size={14} className="mr-1" /> {sending ? "Envoi..." : "Envoyer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
