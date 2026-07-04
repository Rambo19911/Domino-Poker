import { getStoreItem, type StoreItemKind } from "@domino-poker/shared";

import type { PurchaseReason, WalletService } from "../wallet/WalletService.js";

/**
 * Veikala aplikācijas slānis (Fāze 4) — validē preci pret katalogu un orķestrē pirkumu
 * caur `WalletService`. Serveris ir autoritatīvs: cena nāk no KATALOGA (ne no klienta),
 * un īpašumtiesības tiek atvasinātas no `coin_ledger` (reason atkarīgs no preces veida).
 * Pirkums ir atomisks + idempotents (debets UN īpašums vienā ledger rindā).
 */

/** Preces veids → ledger īpašumtiesību iemesls (VIENĪGAIS kartējums; D3). */
const KIND_TO_REASON: Record<StoreItemKind, PurchaseReason> = {
  theme: "theme_purchase",
  bot_assistant: "bot_purchase"
};
export type PurchaseResult =
  | { readonly ok: true; readonly alreadyOwned: boolean; readonly balance: number }
  | { readonly ok: false; readonly reason: "unknown_item" }
  | { readonly ok: false; readonly reason: "insufficient"; readonly balance: number };

export class StoreService {
  private readonly wallet: WalletService;

  constructor(wallet: WalletService) {
    this.wallet = wallet;
  }

  /**
   * Pērk preci `itemId` autentificētam lietotājam. Nezināma prece → `unknown_item` (klients
   * nevar iztēloties cenu vai preci). Cena no kataloga. Atkārtots pirkums = `alreadyOwned`
   * (bez dubulta debeta). Nepietiek monētu → `insufficient` + pašreizējā bilance.
   */
  async purchase(userId: string, itemId: string): Promise<PurchaseResult> {
    const item = getStoreItem(itemId);
    if (!item) {
      return { ok: false, reason: "unknown_item" };
    }
    const result = await this.wallet.purchaseItem(userId, itemId, item.price, KIND_TO_REASON[item.kind]);
    if (!result.ok) {
      return { ok: false, reason: "insufficient", balance: await this.wallet.getBalance(userId) };
    }
    return { ok: true, alreadyOwned: !result.applied, balance: result.balance };
  }

  /** Lietotāja piederošo preču itemId saraksts (atvasināts no ledger). */
  async listOwned(userId: string): Promise<readonly string[]> {
    return this.wallet.listOwnedItems(userId);
  }
}
