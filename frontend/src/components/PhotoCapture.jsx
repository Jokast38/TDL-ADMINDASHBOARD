import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle, ArrowClockwise } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { api } from "@/lib/api";

// Capture d'une photo d'identité conforme pour le dossier (ex: carte CACES) —
// réutilisable depuis l'espace apprenant (son propre téléphone/webcam) ou
// depuis le dashboard agent (smartphone de l'agence), demande du 2026-10-21.
//
// Prise de vue en direct via getUserMedia (caméra frontale), avec un repère
// ovale superposé au flux vidéo pour guider le cadrage du visage — demande
// explicite du 2026-10-21 (un simple <input capture> ouvre parfois le
// sélecteur de fichiers au lieu de l'appareil photo selon le navigateur/
// webview, et ne guide jamais le cadrage). Le bouton "Choisir un fichier"
// reste disponible en secours (caméra indisponible, permission refusée,
// desktop sans webcam).
//
// `uploadUrl` : endpoint POST (multipart, champ "file") qui enregistre la
// photo. `fetchUrl` : endpoint GET qui sert la photo existante (404 si
// aucune) — utilisé pour afficher l'aperçu déjà en place au chargement.
export default function PhotoCapture({ uploadUrl, fetchUrl, label = "Photo d'identité", testId }) {
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [previewUrl, setPreviewUrl] = useState(null);
  const [hasExisting, setHasExisting] = useState(null); // null = pas encore vérifié
  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [capturedPreview, setCapturedPreview] = useState(null);

  const checkExisting = async () => {
    try {
      const { data } = await api.get(fetchUrl, { responseType: "blob" });
      setPreviewUrl(URL.createObjectURL(data));
      setHasExisting(true);
    } catch {
      setHasExisting(false);
    }
  };

  useEffect(() => { checkExisting(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopStream(), []);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const openCamera = async () => {
    setCapturedBlob(null);
    setCapturedPreview(null);
    setCameraError("");
    setCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCameraError("Caméra indisponible ou accès refusé — utilisez \"Choisir un fichier\" ci-dessous.");
    }
  };

  const closeCamera = () => {
    stopStream();
    setCameraOpen(false);
    setCapturedBlob(null);
    setCapturedPreview(null);
    setCameraError("");
  };

  const snapPhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    // Miroir horizontal pour que la photo capturée corresponde à ce que la
    // personne voit à l'écran (le flux affiché est déjà mis en miroir en CSS).
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setCapturedBlob(blob);
      setCapturedPreview(URL.createObjectURL(blob));
      stopStream();
    }, "image/jpeg", 0.92);
  };

  const retake = () => {
    setCapturedBlob(null);
    setCapturedPreview(null);
    openCamera();
  };

  const uploadBlob = async (blob, filename) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", blob, filename);
      await api.post(uploadUrl, formData, { headers: { "Content-Type": "multipart/form-data" } });
      setPreviewUrl(URL.createObjectURL(blob));
      setHasExisting(true);
      toast.success("Photo enregistrée");
      return true;
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur lors de l'envoi de la photo");
      return false;
    } finally {
      setUploading(false);
    }
  };

  const confirmCapture = async () => {
    if (!capturedBlob) return;
    const ok = await uploadBlob(capturedBlob, "photo.jpg");
    if (ok) closeCamera();
  };

  const onFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image trop volumineuse (max 5 Mo)");
      return;
    }
    await uploadBlob(file, file.name);
  };

  return (
    <div className="space-y-2" data-testid={testId}>
      <p className="text-sm font-medium flex items-center gap-1.5"><Camera size={15} /> {label}</p>
      <p className="text-xs text-gray-500">
        Photo type identité : visage découvert, de face, fond uni, bonne luminosité — comme pour un passeport.
      </p>
      <div className="flex items-center gap-3">
        <div className="w-20 h-26 rounded-md border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center shrink-0" style={{ aspectRatio: "3 / 4" }}>
          {previewUrl ? (
            <img src={previewUrl} alt="Photo d'identité" className="w-full h-full object-cover" />
          ) : (
            <Camera size={22} className="text-gray-300" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          {hasExisting && (
            <span className="inline-flex items-center gap-1 text-xs text-green-700">
              <CheckCircle size={13} weight="fill" /> Photo enregistrée
            </span>
          )}
          <Button type="button" size="sm" onClick={openCamera} disabled={uploading} data-testid={testId ? `${testId}-btn` : undefined}>
            <Camera size={14} className="mr-1" />
            {hasExisting ? "Reprendre la photo" : "Prendre une photo"}
          </Button>
          <button
            type="button"
            className="text-xs text-gray-400 hover:text-gray-600 underline text-left"
            onClick={() => fileInputRef.current?.click()}
          >
            ou choisir un fichier
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
        </div>
      </div>

      <Dialog open={cameraOpen} onOpenChange={(open) => { if (!open) closeCamera(); }}>
        <DialogContent className="max-w-sm p-0 overflow-hidden" data-testid={testId ? `${testId}-dialog` : undefined}>
          <DialogHeader className="p-4 pb-0">
            <DialogTitle>Positionnez votre visage</DialogTitle>
          </DialogHeader>

          <div className="relative bg-black" style={{ aspectRatio: "3 / 4" }}>
            {cameraError ? (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white">
                {cameraError}
              </div>
            ) : capturedPreview ? (
              <img src={capturedPreview} alt="Photo capturée" className="w-full h-full object-cover" />
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                  data-testid={testId ? `${testId}-video` : undefined}
                />
                {/* Repère de cadrage — ovale centré pour positionner le visage,
                    + ligne des épaules, comme un guide de photo d'identité. */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 300 400" preserveAspectRatio="none">
                  <defs>
                    <mask id="face-guide-mask">
                      <rect x="0" y="0" width="300" height="400" fill="white" />
                      <ellipse cx="150" cy="170" rx="78" ry="105" fill="black" />
                    </mask>
                  </defs>
                  <rect x="0" y="0" width="300" height="400" fill="rgba(0,0,0,0.45)" mask="url(#face-guide-mask)" />
                  <ellipse cx="150" cy="170" rx="78" ry="105" fill="none" stroke="#d4af37" strokeWidth="2.5" strokeDasharray="6 5" />
                  <path d="M 70 330 Q 150 280 230 330" fill="none" stroke="#d4af37" strokeWidth="2" strokeDasharray="4 4" opacity="0.8" />
                </svg>
                <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-white/90 px-4">
                  Alignez votre visage dans l'ovale, regardez l'objectif
                </p>
              </>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />

          <div className="p-4 flex items-center justify-center gap-3">
            {cameraError ? (
              <Button variant="outline" onClick={closeCamera}>Fermer</Button>
            ) : capturedPreview ? (
              <>
                <Button variant="outline" onClick={retake} disabled={uploading}>
                  <ArrowClockwise size={14} className="mr-1" /> Reprendre
                </Button>
                <Button onClick={confirmCapture} disabled={uploading}>
                  {uploading ? "Envoi..." : "Valider cette photo"}
                </Button>
              </>
            ) : (
              <Button onClick={snapPhoto} className="rounded-full w-14 h-14 p-0" aria-label="Capturer la photo">
                <Camera size={22} />
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
