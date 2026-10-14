"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { WorkspaceController, type LocalProjectStore } from "./workspace-controller";

const STORAGE_KEY = "trinika-labs:project:v1";
export const browserProjectStore: LocalProjectStore = {
  read: () => window.localStorage.getItem(STORAGE_KEY),
  write: (json) => window.localStorage.setItem(STORAGE_KEY, json),
};

export function useWorkspace() {
  const [controller] = useState(() => new WorkspaceController());
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => {
    controller.initializeLocal(browserProjectStore);
    const onKeyDown = (event: KeyboardEvent) => {
      const editable = event.target instanceof HTMLElement && (event.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName));
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        controller.saveLocal(browserProjectStore);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !editable) {
        event.preventDefault();
        if (event.shiftKey) controller.redo(); else controller.undo();
      } else if (event.key === "Escape") controller.cancelConnection();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (controller.getSnapshot().dirty) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [controller]);

  return { controller, snapshot };
}
