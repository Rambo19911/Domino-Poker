// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as authApi from "../lib/auth/authApi";
import { AUTH_TOKEN_STORAGE_KEY, useAuthUser } from "../lib/auth/useAuthUser";

// F7: valodas saglabāšana. Mock-ojam visu auth HTTP slāni; testējam TIKAI hook loģiku.
vi.mock("../lib/auth/authApi", () => ({
  apiMe: vi.fn(),
  apiLogin: vi.fn(),
  apiRegister: vi.fn(),
  apiLogout: vi.fn(),
  apiSetLanguage: vi.fn(),
  apiUpdateProfile: vi.fn(),
  apiUploadAvatar: vi.fn()
}));

const mockedMe = vi.mocked(authApi.apiMe);
const mockedSetLanguage = vi.mocked(authApi.apiSetLanguage);
const mockedLogin = vi.mocked(authApi.apiLogin);

const user = { id: "u1", username: "Rihards", avatar: "avatar-01" };

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("useAuthUser — language persistence (F7)", () => {
  it("applies the server language on mount with a stored token", async () => {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, "tok");
    mockedMe.mockResolvedValue({ ok: true, data: { user, stats: null, language: "lv", rankBadge: null } });

    const { result } = renderHook(() => useAuthUser());

    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(result.current.language).toBe("lv");
  });

  it("setLanguage (authenticated) persists via apiSetLanguage and updates state optimistically", async () => {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, "tok");
    mockedMe.mockResolvedValue({ ok: true, data: { user, stats: null, language: "en", rankBadge: null } });
    mockedSetLanguage.mockResolvedValue({ ok: true, data: { ok: true } });

    const { result } = renderHook(() => useAuthUser());
    await waitFor(() => expect(result.current.status).toBe("authenticated"));

    act(() => result.current.setLanguage("lv"));

    expect(result.current.language).toBe("lv"); // optimistisks lokālais state
    expect(mockedSetLanguage).toHaveBeenCalledWith("tok", "lv");
  });

  it("setLanguage is a no-op for anonymous users (no server call)", async () => {
    const { result } = renderHook(() => useAuthUser());
    await waitFor(() => expect(result.current.status).toBe("anonymous"));

    act(() => result.current.setLanguage("lv"));

    expect(mockedSetLanguage).not.toHaveBeenCalled();
    expect(result.current.language).toBeNull();
  });

  it("refresh() does NOT change the UI language even if the server value differs", async () => {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, "tok");
    mockedMe.mockResolvedValueOnce({ ok: true, data: { user, stats: null, language: "lv", rankBadge: null } });

    const { result } = renderHook(() => useAuthUser());
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(result.current.language).toBe("lv");

    // Serveris tagad ziņo "en" — refresh NEDRĪKST pārslēgt UI valodu (applyLanguage:false).
    mockedMe.mockResolvedValueOnce({ ok: true, data: { user, stats: null, language: "en", rankBadge: null } });
    act(() => result.current.refresh());

    await waitFor(() => expect(mockedMe).toHaveBeenCalledTimes(2));
    expect(result.current.language).toBe("lv"); // refresh to neskar
  });

  it("treats a non-401 /auth/me failure at mount as anonymous (not stuck on loading)", async () => {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, "tok");
    mockedMe.mockResolvedValue({ ok: false, status: 0, error: "network_error" });

    const { result } = renderHook(() => useAuthUser());

    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    expect(result.current.user).toBeNull();
  });

  it("a stale apiSetLanguage 401 (from a replaced token) does NOT log out the newer session", async () => {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, "tokA");
    mockedMe.mockResolvedValue({ ok: true, data: { user, stats: null, language: "en", rankBadge: null } });
    // PATCH paliek pending, lai to atrisinātu PĒC tokena maiņas.
    let resolveSetLanguage: (value: { ok: false; status: number; error: string }) => void = () => {};
    mockedSetLanguage.mockReturnValue(
      new Promise((resolve) => {
        resolveSetLanguage = resolve;
      })
    );

    const { result } = renderHook(() => useAuthUser());
    await waitFor(() => expect(result.current.status).toBe("authenticated"));

    act(() => result.current.setLanguage("lv")); // PATCH uz tokA (pending)

    // Lietotājs pa to laiku ielogojas citā kontā (tokens mainās uz tokB).
    mockedLogin.mockResolvedValue({ ok: true, data: { token: "tokB", user } });
    await act(async () => {
      await result.current.login({ username: "b", password: "b" });
    });
    expect(result.current.status).toBe("authenticated");

    // Novecojusi 401 no tokA atbildes — NEDRĪKST izlogot tokB sesiju.
    await act(async () => {
      resolveSetLanguage({ ok: false, status: 401, error: "unauthorized" });
      await Promise.resolve();
    });

    expect(result.current.status).toBe("authenticated");
  });
});
