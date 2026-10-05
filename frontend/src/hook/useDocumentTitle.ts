import { useEffect } from "react";

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} | Madhuram Motors` : "Madhuram Motors";
  }, [title]);
}
