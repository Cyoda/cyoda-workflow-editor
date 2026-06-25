import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VersionBadge } from "../src/toolbar/VersionBadge.js";
import { VersionSwitchModal } from "../src/modals/VersionSwitchModal.js";

afterEach(cleanup);

describe("VersionBadge", () => {
  it("displays the current version", () => {
    render(<VersionBadge version="v0.8" supportedVersions={["0.7", "0.8"]} />);
    expect(screen.getByTestId("version-badge").textContent).toContain("v0.8");
  });

  it("opens dropdown on click in edit mode", () => {
    render(<VersionBadge version="v0.8" supportedVersions={["0.7", "0.8"]} />);
    expect(screen.queryByTestId("version-dropdown")).toBeNull();
    fireEvent.click(screen.getByTestId("version-badge"));
    expect(screen.getByTestId("version-dropdown")).toBeTruthy();
  });

  it("shows all supported versions in dropdown", () => {
    render(<VersionBadge version="v0.8" supportedVersions={["0.7", "0.8"]} />);
    fireEvent.click(screen.getByTestId("version-badge"));
    expect(screen.getByTestId("version-option-0.7")).toBeTruthy();
    expect(screen.getByTestId("version-option-0.8")).toBeTruthy();
  });

  it("calls onVersionChange when a different version is clicked", () => {
    const onChange = vi.fn();
    render(
      <VersionBadge version="v0.8" supportedVersions={["0.7", "0.8"]} onVersionChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId("version-badge"));
    fireEvent.click(screen.getByTestId("version-option-0.7"));
    expect(onChange).toHaveBeenCalledWith("0.7");
  });

  it("does not call onVersionChange when current version is clicked", () => {
    const onChange = vi.fn();
    render(
      <VersionBadge version="v0.8" supportedVersions={["0.7", "0.8"]} onVersionChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId("version-badge"));
    fireEvent.click(screen.getByTestId("version-option-0.8"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders as non-interactive in readOnly mode", () => {
    render(<VersionBadge version="v0.7" supportedVersions={["0.7", "0.8"]} readOnly />);
    const badge = screen.getByTestId("version-badge");
    expect(badge.tagName).toBe("DIV");
    fireEvent.click(badge);
    expect(screen.queryByTestId("version-dropdown")).toBeNull();
  });
});

describe("VersionSwitchModal", () => {
  it("shows the target version and warning list", () => {
    render(
      <VersionSwitchModal
        fromVersion="0.8"
        toVersion="0.7"
        warnings={["schedule removed from 2 transitions"]}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByTestId("version-switch-modal").textContent).toContain("0.7");
    expect(screen.getByTestId("version-switch-modal").textContent).toContain(
      "schedule removed from 2 transitions",
    );
  });

  it("calls onConfirm when the destructive button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <VersionSwitchModal
        fromVersion="0.8"
        toVersion="0.7"
        warnings={["field dropped"]}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("version-switch-confirm"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when cancel is clicked", () => {
    const onCancel = vi.fn();
    render(
      <VersionSwitchModal
        fromVersion="0.8"
        toVersion="0.7"
        warnings={["field dropped"]}
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByTestId("version-switch-cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
