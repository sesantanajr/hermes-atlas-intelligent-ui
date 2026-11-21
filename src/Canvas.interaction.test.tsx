// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Canvas, barGeometry } from "./Canvas";
import { examples } from "./examples";
import { Canvas as Data } from "./types";
afterEach(cleanup);
function Harness() {
  const [canvas, setCanvas] = useState(examples[1]);
  const [visible, setVisible] = useState(true);
  return (
    <>
      <button onClick={() => setVisible(!visible)}>Toggle</button>
      {visible && <Canvas canvas={canvas} onChange={setCanvas} />}
      <output>{JSON.stringify(canvas)}</output>
    </>
  );
}
describe("persistent interactions", () => {
  it("keeps changed calculator values after unmount and in export data", () => {
    render(<Harness />);
    const slider = screen.getByRole("slider", { name: "Tempo (anos)" });
    fireEvent.change(slider, { target: { value: "11" } });
    fireEvent.click(screen.getByText("Toggle"));
    expect(screen.getByRole("status").textContent).toContain('"value":11');
    fireEvent.click(screen.getByText("Toggle"));
    expect(
      (screen.getByRole("slider", { name: "Tempo (anos)" }) as HTMLInputElement)
        .value,
    ).toBe("11");
  });
  it("places negative values to the left of zero", () => {
    const neg = barGeometry([-10, 10], -10),
      pos = barGeometry([-10, 10], 10);
    expect(neg).toEqual({ left: 0, width: 50, zero: 50 });
    expect(pos.left).toBe(50);
    expect(barGeometry([0], 0).width).toBe(0);
  });
  it("forms prepare user-reviewable values without executing external actions", () => {
    const action = vi.fn();
    const data: Data = {
      id: "f",
      title: "Form",
      description: "",
      schema_version: "1.0",
      blocks: [
        {
          id: "form",
          type: "form",
          title: "Plan",
          fields: [{ id: "name", label: "Name", kind: "text", required: true }],
        },
      ],
      state: { form: { fields: { name: "Atlas" } } },
    };
    render(<Canvas canvas={data} onAction={action} />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar ao Hermes" }));
    expect(action).toHaveBeenCalledWith("Formulário “Plan”:\nName: Atlas");
  });
});
