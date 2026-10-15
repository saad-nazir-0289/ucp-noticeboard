import { useEffect, useRef, useState } from "react";
import { api, hasDeviceToken } from "@shared/api/client";
import { uploadImage, ImageUploadError } from "@shared/api/imageUpload";
import { fromDatetimeLocalValue, toDatetimeLocalValue } from "@shared/noticeForm";
import { optimizeImageUrl } from "@shared/imageOptimize";
import { posterFrom } from "@shared/posterCrop";
import type { AuthUser, Category, Notice } from "@shared/types";
import { Icon } from "@shared/components/Icon";
import { isShareBoilerplate, screenshotText, parseSharedContent, type ParsedShare, type SharedContent } from "@shared/shareParser";
import { readTextFromImage } from "../ocr";
import { PinToggle } from "@shared/components/Tags";

/** Pre-filled values for a new notice (e.g. from something shared into the app). */
export interface NoticeDraft {
  title?: string;
  description?: string;
  linkUrl?: string;
  imageUrl?: string;
  categoryId?: number;
  deadline?: string; // ISO
}

interface Props {
  user: AuthUser;
  categories: Category[];
  /** Editing an existing notice; omit to create a new one. */
  notice?: Notice;
  draft?: NoticeDraft;
  /** Something shared into the app ("Share to NoticeBoard"), to pre-fill from. */
  shared?: { content: SharedContent; image?: File };
  onSaved: (notice: Notice) => void;
  onClose: () => void;
  /** The server said this phone is no longer unlocked — ask for the PIN, keeping the form. */
  onNeedsUnlock: () => void;
}

export function NoticeEditor({ user, categories, notice, draft, shared, onSaved, onClose, onNeedsUnlock }: Props) {
  const initial = notice
    ? { ...notice, deadline: notice.deadline ?? undefined }
    : draft ?? {};
  const [title, setTitle] = useState(initial.title ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [imageUrl, setImageUrl] = useState(initial.imageUrl ?? "");
  // A screenshot cropped to its poster keeps the original, to switch back.
  const [uncropped, setUncropped] = useState<File | null>(null);
  const [linkUrl, setLinkUrl] = useState(initial.linkUrl ?? "");
  const [categoryId, setCategoryId] = useState<number | "">(initial.categoryId ?? "");
  const [deadline, setDeadline] = useState(toDatetimeLocalValue(initial.deadline ?? null));
  const [isPinned, setIsPinned] = useState(notice?.isPinned ?? false);
  const isAdmin = user.role === "Admin";
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick fill: from pasted text, a screenshot, or a share.
  const [hints, setHints] = useState<string[]>([]);
  const [reading, setReading] = useState<number | null>(null); // OCR progress 0-1, null when idle
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [filledFrom, setFilledFrom] = useState<string | null>(null);
  const handledShare = useRef(false);

  /** A shared or picked screenshot: uploads just the poster when one is recognised in it. */
  const uploadFromScreenshot = async (file: File) => {
    const { poster, cropped } = await posterFrom(file);
    setUncropped(cropped ? file : null);
    await uploadPoster(poster);
  };

  const uploadPoster = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      setImageUrl(await uploadImage(file, user.token));
    } catch (err) {
      setError(err instanceof ImageUploadError ? err.message : "Could not upload the poster.");
    } finally {
      setUploading(false);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await uploadPoster(file);
  };

  /** Puts what was understood into the form, leaving fields it found nothing for as they are. */
  const applyParsed = (parsed: ParsedShare, from: string) => {
    if (parsed.title) setTitle(parsed.title);
    if (parsed.description) setDescription(parsed.description);
    if (parsed.linkUrl) setLinkUrl(parsed.linkUrl);
    if (parsed.deadline) setDeadline(toDatetimeLocalValue(parsed.deadline));
    if (parsed.categoryId) setCategoryId(parsed.categoryId);
    setHints(parsed.hints);
    setFilledFrom(from);
  };

  const fillFromText = (content: SharedContent, from: string) => {
    applyParsed(parseSharedContent(content, categories), from);
  };

  /** Reads a screenshot's text on the device, then fills the form from it (plus any shared link). */
  const fillFromImage = async (file: File, extra: SharedContent = {}) => {
    setReading(0);
    setError(null);
    try {
      const read = await readTextFromImage(file, setReading);
      const text = screenshotText(read.text, read.lettering);
      if (!text) {
        setHints(["Couldn't find any text in that image. Fill in the details by hand."]);
        return;
      }
      const parsed = parseSharedContent({ ...extra, text: [text, extra.text].filter(Boolean).join("\n"), fromScreenshot: true }, categories);
      applyParsed({ ...parsed, hints: [] }, "the screenshot");
    } catch (e) {
      // The reason, briefly: what to look into if it keeps happening.
      const reason = e instanceof Error ? e.message : String(e);
      setHints([`Couldn't read the image (${reason.slice(0, 120) || "unknown error"}). Fill in the details by hand, or try again.`]);
    } finally {
      setReading(null);
    }
  };

  const handleScreenshot = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    void uploadFromScreenshot(file);
    await fillFromImage(file);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        fillFromText({ text }, "the copied text");
        return;
      }
    } catch {
      /* clipboard access refused or unsupported (common on iPhone) — paste by hand below */
    }
    setPasteOpen(true);
  };

  // Something shared into the app: fill from its text, use its image as the
  // poster, and read the image too when the share carried little text
  // (an Instagram link, a bare screenshot).
  useEffect(() => {
    if (!shared || handledShare.current) return;
    handledShare.current = true;
    const parsed = parseSharedContent(shared.content, categories);
    applyParsed(parsed, "what you shared");
    if (shared.image) {
      void uploadFromScreenshot(shared.image);
      const realText = (shared.content.text ?? "")
        .split("\n")
        .filter((l) => !isShareBoilerplate(l.trim()))
        .join(" ")
        .replace(/https?:\/\/\S+/g, "")
        .trim();
      if (realText.length < 40) {
        void fillFromImage(shared.image, shared.content);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError("A title and description are required.");
      return;
    }
    if (!hasDeviceToken()) {
      onNeedsUnlock();
      return;
    }
    const payload = {
      title: title.trim(),
      description: description.trim(),
      imageUrl,
      linkUrl: linkUrl.trim(),
      categoryId: categoryId === "" ? null : categoryId,
      deadline: fromDatetimeLocalValue(deadline),
      ...(isAdmin ? { isPinned } : {}),
    };
    setSaving(true);
    setError(null);
    try {
      const saved = notice
        ? await api.updateNotice(notice.id, payload, user.token)
        : await api.createNotice(payload, user.token);
      onSaved(saved);
    } catch (err) {
      if (!hasDeviceToken()) {
        // The unlock lapsed (expired, logged out, role changed): get the
        // PIN again, then they can tap Publish once more — nothing is lost.
        onNeedsUnlock();
      } else {
        setError(err instanceof Error ? err.message : "Could not save the notice.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ucpnb-overlay" onClick={onClose}>
      <form
        className="ucpnb-sheet ucpnb-sheet-tall"
        role="dialog"
        aria-modal="true"
        aria-label={notice ? "Edit notice" : "New notice"}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="ucpnb-sheet-header">
          <h3>{notice ? "Edit notice" : "New notice"}</h3>
          <button type="button" className="ucpnb-icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>

        <div className="ucpnb-sheet-content">
          {!notice && (
            <div className="ucpnb-quickfill">
              <div className="ucpnb-quickfill-head">
                <Icon name="sparkles" size={18} />
                <div>
                  <strong>Quick fill</strong>
                  <span>From a WhatsApp message, an email, or a screenshot of a post.</span>
                </div>
              </div>
              <div className="ucpnb-quickfill-actions">
                <button type="button" className="ucpnb-btn ucpnb-btn-secondary ucpnb-btn-sm" onClick={handlePaste} disabled={reading !== null}>
                  <Icon name="fileText" size={15} />
                  Paste text
                </button>
                <label className={`ucpnb-btn ucpnb-btn-secondary ucpnb-btn-sm${reading !== null ? " is-disabled" : ""}`}>
                  <Icon name="image" size={15} />
                  Read screenshot
                  <input type="file" accept="image/*" onChange={handleScreenshot} disabled={reading !== null} hidden />
                </label>
              </div>
              {pasteOpen && (
                <div className="ucpnb-quickfill-paste">
                  <textarea
                    className="ucpnb-input"
                    rows={4}
                    autoFocus
                    placeholder="Paste the message or email here"
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                  />
                  <button
                    type="button"
                    className="ucpnb-btn ucpnb-btn-primary ucpnb-btn-sm"
                    disabled={!pasteText.trim()}
                    onClick={() => {
                      fillFromText({ text: pasteText }, "the pasted text");
                      setPasteOpen(false);
                      setPasteText("");
                    }}
                  >
                    Fill the form
                  </button>
                </div>
              )}
              {reading !== null && (
                <div className="ucpnb-quickfill-status" role="status">
                  <span className="ucpnb-spinner" />
                  Reading text from the image… {Math.round(reading * 100)}%
                </div>
              )}
              {filledFrom && reading === null && (
                <div className="ucpnb-quickfill-status is-done" role="status">
                  <Icon name="check" size={15} strokeWidth={2.6} />
                  Filled from {filledFrom}. Please review everything before publishing.
                </div>
              )}
              {hints.map((hint) => (
                <p key={hint} className="ucpnb-quickfill-hint">
                  {hint}
                </p>
              ))}
            </div>
          )}

          <label className="ucpnb-field">
            <span className="ucpnb-field-label">Title</span>
            <input className="ucpnb-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Hackathon registrations open" />
          </label>

          <label className="ucpnb-field">
            <span className="ucpnb-field-label">Details</span>
            <textarea className="ucpnb-input" aria-label="Details" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} maxLength={4000} placeholder="What students need to know: dates, venue, who it's for" />
          </label>

          <div className="ucpnb-field">
            <span className="ucpnb-field-label">Poster</span>
            {imageUrl ? (
              <div className="ucpnb-poster">
                <img src={optimizeImageUrl(imageUrl, 700) ?? imageUrl} alt="" />
                <button
                  type="button"
                  className="ucpnb-icon-btn ucpnb-poster-remove"
                  onClick={() => {
                    setImageUrl("");
                    setUncropped(null);
                  }}
                  aria-label="Remove poster"
                >
                  <Icon name="trash" size={18} />
                </button>
              </div>
            ) : null}
            {imageUrl && uncropped ? (
              <p className="ucpnb-field-hint">
                Cropped to the poster.{" "}
                <button
                  type="button"
                  className="ucpnb-link-btn"
                  disabled={uploading}
                  onClick={() => {
                    const original = uncropped;
                    setUncropped(null);
                    void uploadPoster(original);
                  }}
                >
                  Use the whole image
                </button>
              </p>
            ) : null}
            {imageUrl ? null : (
              <label className={`ucpnb-dropzone${uploading ? " is-busy" : ""}`}>
                {uploading ? <span className="ucpnb-spinner" /> : <Icon name="image" size={24} />}
                <strong>{uploading ? "Uploading…" : "Add a poster"}</strong>
                <span>Optional · JPG or PNG up to 8 MB</span>
                <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} hidden />
              </label>
            )}
          </div>

          <div className="ucpnb-field-pair">
            <label className="ucpnb-field">
              <span className="ucpnb-field-label">Category</span>
              <select className="ucpnb-input" aria-label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value === "" ? "" : Number(e.target.value))}>
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="ucpnb-field">
              <span className="ucpnb-field-label">Deadline</span>
              <input className="ucpnb-input" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </label>
          </div>
          <span className="ucpnb-field-hint">Without a deadline, a notice stays up for 7 days.</span>

          {isAdmin && <PinToggle checked={isPinned} onChange={setIsPinned} />}

          <label className="ucpnb-field">
            <span className="ucpnb-field-label">Link</span>
            <input className="ucpnb-input" type="url" inputMode="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="Registration form, event page… (optional)" />
          </label>

          {error && <p className="ucpnb-form-error">{error}</p>}
        </div>

        <div className="ucpnb-sheet-footer">
          <button type="submit" className="ucpnb-btn ucpnb-btn-primary ucpnb-btn-lg ucpnb-btn-block" disabled={saving || uploading}>
            {saving ? <span className="ucpnb-spinner" /> : notice ? "Save changes" : "Publish notice"}
          </button>
        </div>
      </form>
    </div>
  );
}
