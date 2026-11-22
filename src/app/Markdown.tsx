import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { t } from "../i18n";

/**
 * Agent text as Markdown. Raw HTML is never rendered and remote images are not fetched: an
 * image becomes its description, so a reply cannot make the page call a third party.
 */
export const Markdown = React.memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          img: ({ alt }) => (
            <span>
              [{t("Imagem")}: {alt || t("anexo")}]
            </span>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
