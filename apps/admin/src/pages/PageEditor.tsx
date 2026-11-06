import { formatDate, type PageDocument, type PageSection } from "@cloudcart/shared";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import Sortable from "sortablejs";
import { adminGet, adminSend, getCookie } from "../api";
import { ErrorBox, Field, Loading, Modal, toast } from "../components";
import { linkProps, navigate } from "../router";
import { BLOCK_DEFS, allFields, blockDef, newSection, type FieldDef } from "../editor/blocks";

interface PageResponse {
  page: { id: string; slug: string; title: string; type: string; published_version: number | null; updated_at: string };
  draft: PageDocument | null;
  versions: Array<{ version: number; published_at: string; published_by: string | null }>;
}

type Status = "saved" | "dirty" | "saving" | "error";
type Device = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTH: Record<Device, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "390px",
};

function cloneSection(section: PageSection): PageSection {
  return {
    ...section,
    id: `${section.type}-${crypto.randomUUID().slice(0, 8)}`,
    settings: JSON.parse(JSON.stringify(section.settings ?? {})) as Record<string, unknown>,
  };
}

export function PageEditorPage({ slug }: { slug: string }) {
  const [doc, setDoc] = useState<PageDocument | null>(null);
  const [pageInfo, setPageInfo] = useState<PageResponse["page"] | null>(null);
  const [versions, setVersions] = useState<PageResponse["versions"]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<PageDocument[]>([]);
  const [redoStack, setRedoStack] = useState<PageDocument[]>([]);
  const [status, setStatus] = useState<Status>("saved");
  const [device, setDevice] = useState<Device>("desktop");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const outlineRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = useMemo(
    () => doc?.sections.find((section) => section.id === selectedId) ?? null,
    [doc, selectedId],
  );

  useEffect(() => {
    let active = true;
    adminGet<PageResponse>(`/pages/${slug}`)
      .then((data) => {
        if (!active) return;
        setPageInfo(data.page);
        setVersions(data.versions);
        const draft = data.draft ?? { version: 1, page: slug, sections: [] };
        setDoc(draft);
        setSelectedId(draft.sections[0]?.id ?? null);
        void renderPreview(draft);
      })
      .catch((err: unknown) => {
        if (active) setLoadError(err instanceof Error ? err.message : "Unable to load the page.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    if (!outlineRef.current || !doc) return;
    const sortable = Sortable.create(outlineRef.current, {
      animation: 150,
      handle: ".drag-handle",
      ghostClass: "outline-item--ghost",
      onEnd: (event) => {
        if (event.oldIndex === undefined || event.newIndex === undefined || event.oldIndex === event.newIndex) return;
        const current = doc;
        const sections = [...current.sections];
        const [moved] = sections.splice(event.oldIndex, 1);
        if (!moved) return;
        sections.splice(event.newIndex, 0, moved);
        apply({ ...current, sections });
      },
    });
    return () => sortable.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  function apply(next: PageDocument, pushHistory = true): void {
    if (doc && pushHistory) {
      setUndoStack((stack) => [...stack, doc].slice(-60));
      setRedoStack([]);
    }
    setDoc(next);
    setStatus("dirty");
    scheduleSave(next);
    schedulePreview(next);
  }

  function scheduleSave(next: PageDocument): void {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveDocument(next, false); }, 1200);
  }

  function schedulePreview(next: PageDocument): void {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => { void renderPreview(next); }, 450);
  }

  async function saveDocument(next: PageDocument, manual: boolean): Promise<boolean> {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setStatus("saving");
    try {
      await adminSend(`/pages/${slug}/draft`, "PUT", { document: next });
      setStatus("saved");
      if (manual) toast("Draft saved.");
      return true;
    } catch (err) {
      setStatus("error");
      if (manual) toast(err instanceof Error ? err.message : "Save failed.", "error");
      return false;
    }
  }

  async function renderPreview(next: PageDocument): Promise<void> {
    try {
      const response = await fetch(`/api/admin/pages/${slug}/preview`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCookie("cc_csrf"),
        },
        body: JSON.stringify({ document: next }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setPreviewError(payload?.error?.message ?? "Preview failed.");
        return;
      }
      setPreviewError(null);
      setPreviewHtml(await response.text());
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Preview failed.");
    }
  }

  function undo(): void {
    if (!doc || undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1]!;
    setUndoStack(undoStack.slice(0, -1));
    setRedoStack([doc, ...redoStack].slice(0, 60));
    setDoc(previous);
    setStatus("dirty");
    scheduleSave(previous);
    schedulePreview(previous);
  }

  function redo(): void {
    if (!doc || redoStack.length === 0) return;
    const next = redoStack[0]!;
    setRedoStack(redoStack.slice(1));
    setUndoStack([...undoStack, doc].slice(-60));
    setDoc(next);
    setStatus("dirty");
    scheduleSave(next);
    schedulePreview(next);
  }

  function addSection(type: string): void {
    if (!doc) return;
    const section = newSection(type);
    apply({ ...doc, sections: [...doc.sections, section] });
    setSelectedId(section.id);
  }

  function updateSection(next: PageSection): void {
    if (!doc) return;
    apply({ ...doc, sections: doc.sections.map((section) => section.id === next.id ? next : section) });
  }

  function updateSetting(key: string, value: unknown): void {
    if (!selected) return;
    updateSection({ ...selected, settings: { ...selected.settings, [key]: value } });
  }

  function removeSection(id: string): void {
    if (!doc) return;
    apply({ ...doc, sections: doc.sections.filter((section) => section.id !== id) });
    if (selectedId === id) setSelectedId(null);
  }

  function duplicateSection(section: PageSection): void {
    if (!doc) return;
    const copy = cloneSection(section);
    const index = doc.sections.findIndex((item) => item.id === section.id);
    const sections = [...doc.sections];
    sections.splice(index + 1, 0, copy);
    apply({ ...doc, sections });
    setSelectedId(copy.id);
  }

  function moveSection(index: number, direction: -1 | 1): void {
    if (!doc) return;
    const target = index + direction;
    if (target < 0 || target >= doc.sections.length) return;
    const sections = [...doc.sections];
    const [moved] = sections.splice(index, 1);
    if (!moved) return;
    sections.splice(target, 0, moved);
    apply({ ...doc, sections });
  }

  async function publish(): Promise<void> {
    if (!doc) return;
    setPublishing(true);
    try {
      const saved = await saveDocument(doc, false);
      if (!saved) return;
      const result = await adminSend<{ version: number }>(`/pages/${slug}/publish`, "POST", {});
      toast(`Published version ${result.version}.`);
      const refreshed = await adminGet<PageResponse>(`/pages/${slug}`);
      setVersions(refreshed.versions);
      setPageInfo(refreshed.page);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Publish failed.", "error");
    } finally {
      setPublishing(false);
    }
  }

  if (loading) return <Loading />;
  if (loadError) return <ErrorBox message={loadError} onRetry={() => navigate(`/pages/${slug}/edit`)} />;
  if (!doc) return <ErrorBox message="Page not found." />;

  const statusLabel = status === "saved" ? "All changes saved" : status === "saving" ? "Saving…" : status === "dirty" ? "Unsaved changes" : "Save failed";

  return (
    <div class="editor-page">
      <header class="editor-topbar">
        <div class="editor-topbar-left">
          <a class="button button--small" {...linkProps("/pages")}>← Pages</a>
          <div>
            <strong>{pageInfo?.title ?? slug}</strong>
            <span class={`editor-status editor-status--${status}`}>{statusLabel}</span>
          </div>
        </div>
        <div class="editor-topbar-center">
          <button type="button" class="button button--small" onClick={undo} disabled={undoStack.length === 0} title="Undo">↶ Undo</button>
          <button type="button" class="button button--small" onClick={redo} disabled={redoStack.length === 0} title="Redo">↷ Redo</button>
          <div class="device-switcher" role="group" aria-label="Preview size">
            {(["desktop", "tablet", "mobile"] as Device[]).map((value) => (
              <button key={value} type="button" class={`button button--small${device === value ? " button--primary" : ""}`} onClick={() => setDevice(value)}>
                {value === "desktop" ? "Desktop" : value === "tablet" ? "Tablet" : "Mobile"}
              </button>
            ))}
          </div>
        </div>
        <div class="editor-topbar-right">
          <button type="button" class="button button--small" onClick={() => setShowVersions(true)}>Versions</button>
          <a class="button button--small" href="/" target="_blank" rel="noopener">View store ↗</a>
          <button type="button" class="button button--small" onClick={() => void saveDocument(doc, true)}>Save</button>
          <button type="button" class="button button--primary button--small" onClick={() => void publish()} disabled={publishing}>
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </div>
      </header>

      <div class="editor-three">
        <aside class="editor-panel editor-panel--left">
          <section class="panel-block">
            <h3>Add section</h3>
            <div class="palette">
              {BLOCK_DEFS.map((block) => (
                <button key={block.type} type="button" class="palette-item" onClick={() => addSection(block.type)} title={block.description}>
                  <strong>{block.label}</strong>
                  <span>{block.group}</span>
                </button>
              ))}
            </div>
          </section>
          <section class="panel-block">
            <h3>Page structure</h3>
            {doc.sections.length === 0 && <p class="muted small">No sections yet. Add one from the palette.</p>}
            <div class="outline" ref={outlineRef}>
              {doc.sections.map((section, index) => {
                const def = blockDef(section.type);
                return (
                  <div
                    key={section.id}
                    class={`outline-item${selectedId === section.id ? " outline-item--selected" : ""}${section.enabled ? "" : " outline-item--disabled"}`}
                    onClick={() => setSelectedId(section.id)}
                  >
                    <span class="drag-handle" title="Drag to reorder">⠿</span>
                    <div class="outline-name">
                      <strong>{def?.label ?? section.type}</strong>
                      <span>{section.enabled ? "Visible" : "Hidden"}</span>
                    </div>
                    <div class="outline-actions">
                      <button type="button" class="icon-button icon-button--small" title="Move up" onClick={(event) => { event.stopPropagation(); moveSection(index, -1); }} disabled={index === 0}>↑</button>
                      <button type="button" class="icon-button icon-button--small" title="Move down" onClick={(event) => { event.stopPropagation(); moveSection(index, 1); }} disabled={index === doc.sections.length - 1}>↓</button>
                      <button type="button" class="icon-button icon-button--small" title={section.enabled ? "Hide" : "Show"} onClick={(event) => { event.stopPropagation(); updateSection({ ...section, enabled: !section.enabled }); }}>{section.enabled ? "◉" : "○"}</button>
                      <button type="button" class="icon-button icon-button--small" title="Duplicate" onClick={(event) => { event.stopPropagation(); duplicateSection(section); }}>⧉</button>
                      <button type="button" class="icon-button icon-button--small icon-button--danger" title="Delete" onClick={(event) => { event.stopPropagation(); removeSection(section.id); }}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>

        <main class="editor-canvas">
          <div class="preview-toolbar">
            <span class="muted small">Live preview · unpublished draft</span>
            {previewError && <span class="error-text">{previewError}</span>}
          </div>
          <div class="preview-frame" style={{ width: DEVICE_WIDTH[device] }}>
            {previewHtml ? (
              <iframe
                title="Page preview"
                srcdoc={previewHtml}
                sandbox="allow-scripts allow-forms"
                class="preview-iframe"
              />
            ) : (
              <div class="preview-placeholder">Generating preview…</div>
            )}
          </div>
        </main>

        <aside class="editor-panel editor-panel--right">
          {!selected ? (
            <div class="panel-block">
              <h3>Page settings</h3>
              <p class="muted small">Select a section to edit its content and style. Drag the ⠿ handle to reorder sections.</p>
              <p class="muted small">Published version: {pageInfo?.published_version ?? "not published"}</p>
            </div>
          ) : (
            <SectionSettings
              section={selected}
              onUpdate={updateSection}
              onSetting={updateSetting}
              onDuplicate={() => duplicateSection(selected)}
              onRemove={() => removeSection(selected.id)}
            />
          )}
        </aside>
      </div>

      {showVersions && (
        <Modal title="Published versions" onClose={() => setShowVersions(false)}>
          {versions.length === 0 ? <p class="muted">No published versions yet.</p> : (
            <ul class="plain-list">
              {versions.map((version) => (
                <li key={version.version} class="version-row">
                  <strong>Version {version.version}</strong>
                  <span class="muted small">{formatDate(version.published_at)}</span>
                </li>
              ))}
            </ul>
          )}
          <p class="muted small">Published versions are immutable snapshots. Restoring an older version is not implemented in this build.</p>
        </Modal>
      )}
    </div>
  );
}

function SectionSettings({
  section,
  onUpdate,
  onSetting,
  onDuplicate,
  onRemove,
}: {
  section: PageSection;
  onUpdate: (section: PageSection) => void;
  onSetting: (key: string, value: unknown) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const def = blockDef(section.type);
  if (!def) {
    return <div class="panel-block"><h3>Unknown section</h3><p class="muted small">Type: {section.type}</p></div>;
  }
  return (
    <>
      <section class="panel-block">
        <div class="panel-heading">
          <div>
            <h3>{def.label}</h3>
            <p class="muted small">{def.description}</p>
          </div>
          <label class="switch" title="Show or hide">
            <input type="checkbox" checked={section.enabled} onChange={(event) => onUpdate({ ...section, enabled: (event.target as HTMLInputElement).checked })} />
            <span>{section.enabled ? "Visible" : "Hidden"}</span>
          </label>
        </div>
      </section>
      <section class="panel-block">
        <h3>Content</h3>
        <div class="stack">
          {def.fields.map((field) => (
            <SettingField
              key={field.key}
              field={field}
              value={section.settings[field.key]}
              onChange={(value) => onSetting(field.key, value)}
            />
          ))}
          {def.fields.length === 0 && <p class="muted small">This section has no content settings.</p>}
        </div>
      </section>
      <section class="panel-block">
        <h3>Style</h3>
        <div class="stack">
          {allFields({ ...def, fields: [] }).map((field) => (
            <SettingField
              key={field.key}
              field={field}
              value={section.settings[field.key]}
              onChange={(value) => onSetting(field.key, value)}
            />
          ))}
        </div>
      </section>
      <section class="panel-block">
        <div class="row-actions">
          <button type="button" class="button button--small" onClick={onDuplicate}>Duplicate</button>
          <button type="button" class="button button--small button--danger" onClick={onRemove}>Delete section</button>
        </div>
      </section>
    </>
  );
}

function SettingField({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.type === "repeater") {
    const items = Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
    const itemFields = field.itemFields ?? [];
    return (
      <div class="field">
        <span class="field-label">{field.label}</span>
        <div class="repeater">
          {items.map((item, index) => (
            <div class="repeater-item" key={index}>
              <div class="repeater-item-header">
                <span>Item {index + 1}</span>
                <button type="button" class="link-button link-button--danger" onClick={() => onChange(items.filter((_, i) => i !== index))}>Remove</button>
              </div>
              {itemFields.map((itemField) => (
                <Field key={itemField.key} label={itemField.label}>
                  {itemField.type === "textarea" ? (
                    <textarea
                      rows={2}
                      value={String(item[itemField.key] ?? "")}
                      onInput={(event) => {
                        const next = [...items];
                        next[index] = { ...item, [itemField.key]: (event.target as HTMLTextAreaElement).value };
                        onChange(next);
                      }}
                    />
                  ) : (
                    <input
                      type={(itemField.type === "number" ? "number" : "text") as "text"}
                      value={String(item[itemField.key] ?? "")}
                      onInput={(event) => {
                        const raw = (event.target as HTMLInputElement).value;
                        const next = [...items];
                        next[index] = { ...item, [itemField.key]: itemField.type === "number" ? Number(raw) : raw };
                        onChange(next);
                      }}
                    />
                  )}
                </Field>
              ))}
            </div>
          ))}
          <button
            type="button"
            class="button button--small"
            onClick={() => onChange([...items, Object.fromEntries(itemFields.map((itemField) => [itemField.key, itemField.type === "number" ? 5 : ""]))])}
          >
            + Add item
          </button>
        </div>
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <Field label={field.label} hint={field.hint}>
        <select value={String(value ?? "")} onChange={(event) => onChange((event.target as HTMLSelectElement).value)}>
          {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </Field>
    );
  }

  if (field.type === "color") {
    const text = String(value ?? "");
    return (
      <Field label={field.label} hint={field.hint}>
        <div class="color-field">
          <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(text) ? text : "#ffffff"} onInput={(event) => onChange((event.target as HTMLInputElement).value)} />
          <input value={text} placeholder="theme default" onInput={(event) => onChange((event.target as HTMLInputElement).value)} />
        </div>
      </Field>
    );
  }

  if (field.type === "number") {
    return (
      <Field label={field.label} hint={field.hint}>
        <input
          type="number"
          min={field.min}
          max={field.max}
          value={value === undefined || value === null ? "" : String(value)}
          onInput={(event) => {
            const raw = (event.target as HTMLInputElement).value;
            onChange(raw === "" ? "" : Number(raw));
          }}
        />
      </Field>
    );
  }

  if (field.type === "html" || field.type === "textarea") {
    return (
      <Field label={field.label} hint={field.hint}>
        <textarea rows={field.type === "html" ? 6 : 3} value={String(value ?? "")} onInput={(event) => onChange((event.target as HTMLTextAreaElement).value)} />
      </Field>
    );
  }

  return (
    <Field label={field.label} hint={field.hint}>
      <input
        type={field.type === "url" ? "text" : "text"}
        value={String(value ?? "")}
        placeholder={field.placeholder}
        onInput={(event) => onChange((event.target as HTMLInputElement).value)}
      />
    </Field>
  );
}
