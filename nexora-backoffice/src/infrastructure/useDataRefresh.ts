import { useEffect, useState } from "react";
import { CACHE_EVENT, refreshCompany } from "./query-cache";
/** Refresh read-only views; callers disable this while an editor or confirmation is open. */
export function useDataRefresh(company: string, enabled = true) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled || !company) return;
    const changed = (e: Event) => {
      if ((e as CustomEvent<string>).detail === company)
        setRevision((n) => n + 1);
    };
    const refresh = () => {
      if (document.visibilityState !== "hidden") refreshCompany(company, false);
    };
    window.addEventListener(CACHE_EVENT, changed);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(CACHE_EVENT, changed);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [company, enabled]);
  return revision;
}
