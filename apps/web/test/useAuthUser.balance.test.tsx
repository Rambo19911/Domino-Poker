// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as authApi from "../lib/auth/authApi";
import { AUTH_TOKEN_STORAGE_KEY, useAuthUser } from "../lib/auth/useAuthUser";

/**
 * T7.7 — bilances rakstīšanas SECĪBA.
 *
 * `applyBalance` nes autoritatīvu summu no norēķina (slotu grieziens, veikala pirkums,
 * dienas balva). `/auth/me` nes momentuzņēmumu, kas varēja startēt AGRĀK. Tokena
 * pārbaude šo neatšķir — abos gadījumos tokens ir tas pats —, tāpēc novēlota `/auth/me`
 * atbilde citādi uzrakstītu veco skaitli pāri svaigākajam norēķinam.
 *
 * Tas pats race-aizsardzības paraugs, kas jau bija valodai (`languageWriteSeq`).
 */

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

const user = { id: "u1", username: "Rihards", avatar: "avatar-01" };

function meResult(balance: number) {
  // `language` ir `GameLanguage` savienojums, ne `string` — bez `as const` tas paplašinātos.
  return {
    ok: true as const,
    data: { user, stats: null, language: "en" as const, rankBadge: null, balance }
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("useAuthUser — bilances rakstīšanas secība (T7.7)", () => {
  it("novecojusi /auth/me atbilde NEPĀRRAKSTA jaunāku norēķinu", async () => {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, "tok");
    mockedMe.mockResolvedValueOnce(meResult(1_000));

    const { result } = renderHook(() => useAuthUser());
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(result.current.balance).toBe(1_000);

    // `refresh()` startē ar servera momentuzņēmumu 1 000 un paliek pending.
    let resolveMe: (value: ReturnType<typeof meResult>) => void = () => {};
    mockedMe.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveMe = resolve;
      })
    );
    act(() => result.current.refresh());

    // Pa to laiku slotu grieziens norēķinās un ziņo autoritatīvo 4 200.
    act(() => result.current.applyBalance(4_200));
    expect(result.current.balance).toBe(4_200);

    // Novēlotā /auth/me atbilde nes VECO summu — tā jāignorē.
    await act(async () => {
      resolveMe(meResult(1_000));
      await Promise.resolve();
    });

    expect(result.current.balance).toBe(4_200);
  });

  it("pieņem /auth/me bilanci, kad neviens jaunāks norēķins nav noticis", async () => {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, "tok");
    mockedMe.mockResolvedValueOnce(meResult(1_000));

    const { result } = renderHook(() => useAuthUser());
    await waitFor(() => expect(result.current.status).toBe("authenticated"));

    mockedMe.mockResolvedValueOnce(meResult(7_500));
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.balance).toBe(7_500));
  });
});
