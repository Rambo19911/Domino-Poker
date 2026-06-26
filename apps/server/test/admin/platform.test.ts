import { describe, expect, it } from "vitest";

import { classifyPlatform } from "../../src/admin/platform.js";

describe("classifyPlatform", () => {
  it("classifies mobile user-agents (Android UA contains 'Linux' but matches mobile first)", () => {
    expect(
      classifyPlatform(
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36"
      )
    ).toBe("mobile");
    expect(
      classifyPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")
    ).toBe("mobile");
  });

  it("classifies desktop user-agents", () => {
    expect(
      classifyPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36")
    ).toBe("desktop");
    expect(
      classifyPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15")
    ).toBe("desktop");
    expect(classifyPlatform("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36")).toBe(
      "desktop"
    );
  });

  it("classifies unknown/empty/non-browser as other", () => {
    expect(classifyPlatform(undefined)).toBe("other");
    expect(classifyPlatform("")).toBe("other");
    expect(classifyPlatform("curl/8.4.0")).toBe("other");
    expect(classifyPlatform("SomeBot/1.0 (+http://example.com/bot)")).toBe("other");
  });
});
