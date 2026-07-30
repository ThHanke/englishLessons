// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { ResizableSplit } from "./ResizableSplit.tsx";

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
});

function mockContainerWidth(container: HTMLElement, width: number) {
  const root = container.querySelector(".companion-split-root") as HTMLElement;
  root.getBoundingClientRect = () =>
    ({ width, left: 0, right: width, top: 0, bottom: 0, height: 0, x: 0, y: 0, toJSON: () => {} }) as DOMRect;
}

function firePointer(el: EventTarget, type: string, clientX: number, pointerId = 1) {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, clientX, pointerId });
  // pointermove/pointerup are handled by a plain `window.addEventListener` (not React's synthetic
  // event system), so the resulting setState needs an explicit `act()` flush -- without it, the
  // DOM assertion right after this call would still see the pre-update render.
  act(() => {
    el.dispatchEvent(event);
  });
}

describe("ResizableSplit", () => {
  it("renders left/right at the default ratio", () => {
    const { container } = render(
      <ResizableSplit left={<div>LEFT</div>} right={<div>RIGHT</div>} defaultLeftFraction={0.67} />,
    );
    const panes = container.querySelectorAll(".companion-split-pane");
    expect(parseFloat((panes[0] as HTMLElement).style.flexBasis)).toBeCloseTo(67);
    expect(parseFloat((panes[1] as HTMLElement).style.flexBasis)).toBeCloseTo(33);
    expect(screen.getByText("LEFT")).toBeInTheDocument();
    expect(screen.getByText("RIGHT")).toBeInTheDocument();
  });

  it("updates the ratio on drag, clamped by minLeftPx/minRightPx", () => {
    const { container } = render(
      <ResizableSplit
        left={<div>LEFT</div>}
        right={<div>RIGHT</div>}
        defaultLeftFraction={0.5}
        minLeftPx={200}
        minRightPx={200}
      />,
    );
    mockContainerWidth(container, 1000);
    const divider = screen.getByTestId("companion-split-divider");

    divider.setPointerCapture = () => {};
    firePointer(divider, "pointerdown", 500);
    firePointer(window, "pointermove", 800);

    const panes = container.querySelectorAll(".companion-split-pane");
    expect(parseFloat((panes[0] as HTMLElement).style.flexBasis)).toBeCloseTo(80);

    // Dragging past the right clamp (min 200px right pane => max 80% left) should clamp, not
    // exceed it -- try to push further right and confirm it doesn't go past 80%.
    firePointer(window, "pointermove", 950);
    expect(parseFloat((panes[0] as HTMLElement).style.flexBasis)).toBeCloseTo(80);

    firePointer(window, "pointerup", 950);
  });

  it("persists the dragged ratio to localStorage under storageKey, and restores it on mount", () => {
    const { container, unmount } = render(
      <ResizableSplit
        left={<div>LEFT</div>}
        right={<div>RIGHT</div>}
        defaultLeftFraction={0.5}
        storageKey="test-split-ratio"
      />,
    );
    mockContainerWidth(container, 1000);
    const divider = screen.getByTestId("companion-split-divider");
    divider.setPointerCapture = () => {};
    firePointer(divider, "pointerdown", 500);
    firePointer(window, "pointermove", 700);
    firePointer(window, "pointerup", 700);

    expect(localStorage.getItem("test-split-ratio")).toBe("0.7");
    unmount();

    const { container: container2 } = render(
      <ResizableSplit
        left={<div>LEFT</div>}
        right={<div>RIGHT</div>}
        defaultLeftFraction={0.5}
        storageKey="test-split-ratio"
      />,
    );
    const panes = container2.querySelectorAll(".companion-split-pane");
    expect(parseFloat((panes[0] as HTMLElement).style.flexBasis)).toBeCloseTo(70);
  });
});
