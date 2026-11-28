import { useEffect, useRef, useState } from "react";
import type { User } from "@shared";
import { api } from "./api";

export function useUserSearch(q: string, min = 1) {
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useRef(0);
  useEffect(() => {
    const query = q.trim().replace(/^@/, "");
    if (query.length < min) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const my = ++id.current;
    const t = setTimeout(async () => {
      try {
        const r = await api("GET /v1/users/search", { query: { q: query } });
        if (my === id.current) {
          setResults(r);
          setError(null);
        }
      } catch (e) {
        if (my === id.current) setError((e as Error).message);
      } finally {
        if (my === id.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, min]);
  return { results, loading, error };
}
