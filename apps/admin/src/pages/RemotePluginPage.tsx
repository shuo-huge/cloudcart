import { useEffect, useRef, useState } from "preact/hooks";
import { adminGet, adminSend } from "../api";
import { ErrorBox, Loading, toast } from "../components";
import { linkProps } from "../router";
import type { PluginRow } from "../types";

interface LaunchResponse {
  token: string;
  expiresAt: string;
  storeId: string;
  pluginId: string;
  permissions: string[];
  pageId?: string;
}

export function RemotePluginPage({ pluginId, pageId }: { pluginId: string; pageId: string }) {
  const [plugin, setPlugin] = useState<PluginRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "connected" | "error">("loading");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastLaunch = useRef(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    adminGet<PluginRow[]>("/plugins")
      .then((rows) => {
        if (!active) return;
        const found = rows.find((entry) => entry.id === pluginId) ?? null;
        setPlugin(found);
        if (!found) setError("Plugin not found.");
        else if (found.enabled !== 1 || found.runtime !== "remote") setError("This plugin is not enabled.");
        else if (!found.adminEntryUrl) setError("This plugin does not provide an admin page.");
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Unable to load the plugin.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [pluginId]);

  const page = plugin?.adminPages?.find((entry) => entry.id === pageId);
  const entryUrl = plugin?.adminEntryUrl ?? null;
  const entryOrigin = (() => {
    if (!entryUrl) return null;
    try { return new URL(entryUrl).origin; } catch { return null; }
  })();
  const iframeUrl = (() => {
    if (!entryUrl) return null;
    try {
      const url = new URL(entryUrl);
      url.searchParams.set("page", pageId);
      url.searchParams.set("store", window.location.origin);
      return url.toString();
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    if (!iframeUrl || !entryOrigin) return;
    setStatus("loading");
    const timer = window.setTimeout(() => {
      setStatus("error");
    }, 15_000);

    async function issueToken(): Promise<void> {
      try {
        const result = await adminSend<LaunchResponse>(`/plugins/${encodeURIComponent(pluginId)}/launch`, "POST", { pageId });
        const frame = iframeRef.current?.contentWindow;
        if (!frame || !entryOrigin) return;
        frame.postMessage({
          type: "cloudcart:token",
          token: result.token,
          expiresAt: result.expiresAt,
          storeId: result.storeId,
          pluginId: result.pluginId,
          pageId: result.pageId,
          permissions: result.permissions,
        }, entryOrigin);
        lastLaunch.current = Date.now();
        window.clearTimeout(timer);
        setStatus("connected");
      } catch (err) {
        window.clearTimeout(timer);
        setStatus("error");
        toast(err instanceof Error ? err.message : "Could not sign in the plugin.", "error");
      }
    }

    function onMessage(event: MessageEvent): void {
      if (event.origin !== entryOrigin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { type?: unknown } | null;
      if (!data || typeof data.type !== "string") return;
      if (data.type === "cloudcart:ready") {
        void issueToken();
      } else if (data.type === "cloudcart:refresh-token") {
        if (Date.now() - lastLaunch.current < 3000) return;
        void issueToken();
      }
    }

    window.addEventListener("message", onMessage);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    };
  }, [iframeUrl, entryOrigin, pluginId, pageId]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={() => window.location.reload()} />;
  if (!plugin || !page || !iframeUrl || !entryOrigin) {
    return <ErrorBox message="This plugin page is not registered." onRetry={() => window.location.reload()} />;
  }

  return (
    <div class="remote-plugin-page">
      <header class="remote-plugin-header">
        <div>
          <p class="breadcrumb">
            <a {...linkProps("/plugins")}>Plugins</a> / {plugin.name}
          </p>
          <h1>{page.label}</h1>
          <p class="muted small">
            Remote plugin · {plugin.author ?? "Unknown author"} · v{plugin.version}
          </p>
        </div>
        <div class="page-actions">
          <button type="button" class="button button--small" onClick={() => window.location.reload()}>Reload</button>
          <a class="button button--small" href={iframeUrl} target="_blank" rel="noopener noreferrer">Open ↗</a>
        </div>
      </header>
      <div class="remote-plugin-frame-wrap">
        {status === "loading" && (
          <div class="remote-plugin-overlay">
            <div class="remote-plugin-spinner" aria-hidden="true" />
            <strong>Connecting to {plugin.name}…</strong>
            <span class="muted small">Waiting for the plugin to finish loading.</span>
          </div>
        )}
        {status === "error" && (
          <div class="remote-plugin-overlay remote-plugin-overlay--error">
            <strong>The plugin did not respond.</strong>
            <span class="muted small">Check its service URL and that it allows this store as a frame ancestor.</span>
            <button type="button" class="button" onClick={() => window.location.reload()}>Try again</button>
          </div>
        )}
        <iframe
          ref={iframeRef}
          class="remote-plugin-frame"
          title={`${plugin.name} · ${page.label}`}
          src={iframeUrl}
          sandbox="allow-scripts allow-forms allow-same-origin"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </div>
  );
}
