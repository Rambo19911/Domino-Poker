// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AvatarRankBadge } from "../components/AvatarRankBadge";

afterEach(cleanup);

describe("AvatarRankBadge", () => {
  it("renders the badge image (decorative) for a resolved badge id", () => {
    const { container } = render(<AvatarRankBadge badge="rank_1" />);
    const img = container.querySelector("img.avatarRankBadge");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("/assets/Badges/rank_1.png");
    expect(img?.getAttribute("aria-hidden")).toBe("true");
    expect(img?.getAttribute("alt")).toBe("");
  });

  it("renders nothing when there is no badge (anonymous / bot / rank 31+)", () => {
    expect(render(<AvatarRankBadge badge={null} />).container.querySelector("img")).toBeNull();
    cleanup();
    expect(render(<AvatarRankBadge badge={undefined} />).container.querySelector("img")).toBeNull();
  });
});
