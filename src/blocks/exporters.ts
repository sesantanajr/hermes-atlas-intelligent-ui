/**
 * Files a canvas can become in the browser (1.1.2): PNG, PDF, CSV, JSON and, in an exported page,
 * the page itself with what the person did on it.
 *
 * Everything runs locally, with no library and no network: a PNG is the canvas drawn through an
 * SVG `foreignObject` onto a `<canvas>`, and a PDF wraps JPEG slices of that image in A4 pages.
 * Both work inside the sandboxed frame the Atlas portal uses, where printing is not allowed.
 */

export function safeName(text: string, fallback = "canvas"): string {
  const plain = String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return plain || fallback;
}

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadTextFile(name: string, text: string, type: string) {
  downloadBlob(name, new Blob([text], { type }));
}

/** The CSS rules this document can read, as text (cross-origin sheets are skipped). */
function documentStyles(): string {
  const parts: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      parts.push(Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n"));
    } catch {
      /* a sheet from another origin: its rules are not ours to read */
    }
  }
  return parts.join("\n");
}

/** The `--atlas-*` values in effect on `element`, so a host theme survives the copy. */
function tokenStyle(element: Element): string {
  const computed = getComputedStyle(element);
  const names: string[] = [];
  for (let i = 0; i < computed.length; i++) if (computed[i].startsWith("--atlas-")) names.push(computed[i]);
  const fallback = [
    "--atlas-bg",
    "--atlas-surface",
    "--atlas-text",
    "--atlas-muted",
    "--atlas-line",
    "--atlas-accent",
  ];
  return [...new Set([...names, ...fallback])]
    .map((name) => `${name}:${computed.getPropertyValue(name)}`)
    .filter((pair) => !pair.endsWith(":"))
    .join(";");
}

const XHTML = "http://www.w3.org/1999/xhtml";

/**
 * Draw `element` (an Atlas canvas) onto a `<canvas>`. Form values are copied into attributes
 * first, since a clone keeps attributes but not what was typed. External images make the image
 * unreadable to scripts (a browser rule), which is reported as an error.
 */
export async function renderElement(element: HTMLElement, options: { scale?: number; background?: string } = {}) {
  const rect = element.getBoundingClientRect();
  const width = Math.ceil(Math.max(rect.width, element.scrollWidth));
  const height = Math.ceil(Math.max(rect.height, element.scrollHeight));
  const scale = Math.max(0.5, Math.min(options.scale ?? 2, 14000 / Math.max(1, height), 8000 / Math.max(1, width)));
  const clone = element.cloneNode(true) as HTMLElement;
  const live = element.querySelectorAll("input, textarea, select");
  clone.querySelectorAll("input, textarea, select").forEach((node, index) => {
    const source = live[index] as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | undefined;
    if (!source) return;
    if (node instanceof HTMLTextAreaElement) node.textContent = source.value;
    else if (node instanceof HTMLSelectElement)
      Array.from(node.options).forEach((option, i) => option.toggleAttribute("selected", i === (source as HTMLSelectElement).selectedIndex));
    else if (node instanceof HTMLInputElement) {
      if (node.type === "checkbox" || node.type === "radio") node.toggleAttribute("checked", (source as HTMLInputElement).checked);
      else node.setAttribute("value", source.value);
    }
  });
  clone.querySelectorAll("[data-export-skip]").forEach((node) => node.remove());
  clone.querySelectorAll("*").forEach((node) => {
    (node as HTMLElement).style?.setProperty("animation", "none");
    (node as HTMLElement).style?.setProperty("transition", "none");
  });
  const root = element.closest(".atlas-app") ?? element;
  const wrapper = document.createElement("div");
  wrapper.setAttribute("xmlns", XHTML);
  wrapper.className = (root as HTMLElement).className;
  for (const name of ["data-theme", "data-host"]) {
    const value = root.getAttribute(name);
    if (value) wrapper.setAttribute(name, value);
  }
  const background = options.background ?? getComputedStyle(root).backgroundColor;
  wrapper.setAttribute(
    "style",
    `${tokenStyle(root)};width:${width}px;padding:0;margin:0;background:${
      background && background !== "rgba(0, 0, 0, 0)" ? background : "var(--atlas-bg)"
    }`,
  );
  const style = document.createElement("style");
  style.textContent = documentStyles() + "\n*{animation:none!important;transition:none!important}";
  wrapper.append(style, clone);
  const markup = new XMLSerializer().serializeToString(wrapper);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject x="0" y="0" width="100%" height="100%">${markup}</foreignObject></svg>`;
  const image = new Image();
  image.decoding = "sync";
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("render failed"));
  });
  image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await loaded;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no 2d context");
  context.scale(scale, scale);
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

export function canvasBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("empty image"))), type, quality),
  );
}

function bytesOfDataUrl(url: string): Uint8Array {
  const base64 = url.slice(url.indexOf(",") + 1);
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * A PDF made of JPEG pages. A4 portrait, 28 pt margins; the image is scaled to the page width and
 * cut into page-high slices. Each slice is its own JPEG (DCTDecode), so no PDF library is needed.
 */
export function pdfFromCanvas(canvas: HTMLCanvasElement, title = "Atlas"): Blob {
  const pageW = 595.28,
    pageH = 841.89,
    margin = 28;
  const drawW = pageW - margin * 2;
  const pxPerPt = canvas.width / drawW;
  const sliceH = Math.max(1, Math.floor((pageH - margin * 2) * pxPerPt));
  const slices: { data: Uint8Array; w: number; h: number }[] = [];
  for (let top = 0; top < canvas.height; top += sliceH) {
    const h = Math.min(sliceH, canvas.height - top);
    const piece = document.createElement("canvas");
    piece.width = canvas.width;
    piece.height = h;
    const ctx = piece.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, piece.width, h);
    ctx.drawImage(canvas, 0, top, canvas.width, h, 0, 0, canvas.width, h);
    slices.push({ data: bytesOfDataUrl(piece.toDataURL("image/jpeg", 0.9)), w: piece.width, h });
  }
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: () => void) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body();
    push("\nendobj\n");
  };
  const pages = slices.length;
  // 1 catalog, 2 pages, 3 info, then per page: page, content, image.
  const pageId = (i: number) => 4 + i * 3;
  push("%PDF-1.4\n%âãÏÓ\n");
  object(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  object(2, () =>
    push(`<< /Type /Pages /Count ${pages} /Kids [${slices.map((_, i) => `${pageId(i)} 0 R`).join(" ")}] >>`),
  );
  // The title as UTF-16BE with a byte-order mark: PDF's own way to carry accents in metadata.
  const utf16 = Array.from(title.slice(0, 120))
    .flatMap((char) => {
      const code = char.codePointAt(0)!;
      if (code <= 0xffff) return [code];
      const v = code - 0x10000;
      return [0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff)];
    })
    .map((unit) => unit.toString(16).padStart(4, "0"))
    .join("");
  object(3, () => push(`<< /Title <FEFF${utf16}> /Producer (Atlas Intelligent UI) >>`));
  slices.forEach((slice, i) => {
    const drawH = slice.h / pxPerPt;
    const content = `q ${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${margin} ${(pageH - margin - drawH).toFixed(2)} cm /Im${i} Do Q`;
    object(pageId(i), () =>
      push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im${i} ${
          pageId(i) + 2
        } 0 R >> >> /Contents ${pageId(i) + 1} 0 R >>`,
      ),
    );
    object(pageId(i) + 1, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    object(pageId(i) + 2, () => {
      push(
        `<< /Type /XObject /Subtype /Image /Width ${slice.w} /Height ${slice.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${slice.data.length} >>\nstream\n`,
      );
      push(slice.data);
      push("\nendstream");
    });
  });
  const total = 4 + pages * 3;
  const xref = length;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let id = 1; id < total; id++) push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}

export async function exportPng(element: HTMLElement, name: string) {
  const canvas = await renderElement(element);
  downloadBlob(`${name}.png`, await canvasBlob(canvas));
}

export async function exportPdf(element: HTMLElement, name: string, title: string) {
  const canvas = await renderElement(element, { scale: 1.6 });
  downloadBlob(`${name}.pdf`, pdfFromCanvas(canvas, title));
}
