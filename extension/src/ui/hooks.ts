import { useCallback, useEffect, useState } from "react";
import type { Api, PanelState } from "../shared/types";

export function useApiState(api: Api): { state: PanelState | null; refresh: () => Promise<void> } {
  const [state, setState] = useState<PanelState | null>(null);
  const refresh = useCallback(async () => { try { setState(await api.getState()); } catch { /* worker restarting */ } }, [api]);
  useEffect(() => { void refresh(); return api.subscribe(() => void refresh()); }, [api, refresh]);
  return { state, refresh };
}
