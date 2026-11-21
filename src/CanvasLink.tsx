import React, { createContext, useContext } from "react";

export const PreviewContext = createContext(false);

/** Keep source and place labels readable while a document is still arriving. */
export function CanvasLink({
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return useContext(PreviewContext) ? (
    <span className={props.className}>{children}</span>
  ) : (
    <a {...props}>{children}</a>
  );
}
