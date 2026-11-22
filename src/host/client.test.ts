import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "../i18n";
import { ApiError, hostError, isCanvasMissing } from "./client";

afterEach(() => setLocale("pt-BR"));

describe("hostError", () => {
  it("reads the status and the server's detail from Hermes Desktop's IPC rejection", () => {
    const error = hostError(
      new Error(
        `Error invoking remote method 'hermes:api': Error: 409: {"detail":"O rascunho foi alterado em outra aba."}`,
      ),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect([error.status, error.detail, error.message]).toEqual([
      409,
      "O rascunho foi alterado em outra aba.",
      "O rascunho foi alterado em outra aba.",
    ]);
  });

  it("reads the `<status>: <body>` form of the Webapp and older dashboards, and translates the detail", () => {
    setLocale("en");
    const error = hostError(new Error(`404: {"detail":"Canvas não encontrado."}`));
    expect([error.status, error.detail, error.message]).toEqual([404, "Canvas não encontrado.", "Canvas not found."]);
    expect(isCanvasMissing(error)).toBe(true);
  });

  it("tells Hermes's own 404 (backend not mounted) from a missing canvas", () => {
    const error = hostError(new Error(`404: {"detail":"Plugin not found"}`));
    expect(error.status).toBe(404);
    expect(isCanvasMissing(error)).toBe(false);
  });

  it("says something readable when the body carries no detail", () => {
    const error = hostError(
      new Error("Error invoking remote method 'hermes:api': Error: 502: <html><body>Bad gateway</body></html>"),
    );
    expect([error.status, error.detail, error.message]).toEqual([502, "", "Não foi possível concluir (502)."]);
  });

  it("keeps a status the host attached, and the words of a failure that never reached the server", () => {
    expect(isCanvasMissing(hostError(Object.assign(new Error("Canvas não encontrado."), { status: 404 })))).toBe(true);
    const body = JSON.stringify({ detail: "Canvas não encontrado." });
    expect(isCanvasMissing(hostError(Object.assign(new Error("Canvas not found."), { status: 404, body })))).toBe(true);
    const timeout = hostError(
      new Error(`Error invoking remote method 'hermes:api': Error: Timed out connecting to profile "default"`),
    );
    expect([timeout.status, timeout.message]).toEqual([0, 'Timed out connecting to profile "default"']);
  });
});
