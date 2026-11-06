import { useEffect, useState } from "preact/hooks";

const NAVIGATE_EVENT = "cloudcart:navigate";

export function navigate(path: string): void {
  const target = path.startsWith("/admin") ? path : `/admin${path.startsWith("/") ? path : `/${path}`}`;
  if (target === window.location.pathname) return;
  window.history.pushState({}, "", target);
  window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT));
  window.scrollTo({ top: 0 });
}

export function usePath(): string {
  const [path, setPath] = useState(window.location.pathname.replace(/^\/admin/, "") || "/");
  useEffect(() => {
    const onChange = () => setPath(window.location.pathname.replace(/^\/admin/, "") || "/");
    window.addEventListener("popstate", onChange);
    window.addEventListener(NAVIGATE_EVENT, onChange);
    return () => {
      window.removeEventListener("popstate", onChange);
      window.removeEventListener(NAVIGATE_EVENT, onChange);
    };
  }, []);
  return path;
}

export function linkProps(path: string) {
  return {
    href: `/admin${path === "/" ? "" : path}`,
    onClick: (event: MouseEvent) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(path);
    },
  };
}

export function matchRoute(path: string, pattern: string): Record<string, string> | null {
  const pathParts = path.split("/").filter(Boolean);
  const patternParts = pattern.split("/").filter(Boolean);
  if (pathParts.length !== patternParts.length) {
    if (!(patternParts.length === 2 && patternParts[1] === "*" && pathParts.length >= 1)) return null;
  }
  const params: Record<string, string> = {};
  for (let index = 0; index < patternParts.length; index += 1) {
    const part = patternParts[index]!;
    const value = pathParts[index];
    if (part === "*") return params;
    if (part.startsWith(":")) {
      if (!value) return null;
      params[part.slice(1)] = decodeURIComponent(value);
      continue;
    }
    if (part !== value) return null;
  }
  return pathParts.length === patternParts.length ? params : null;
}
