/**
 * WebSocket protokola versija. Serveris un klients apmainās ar to `HELLO`/`WELCOME`;
 * nesakritība → `ERROR: PROTOCOL_VERSION_MISMATCH` un savienojuma slēgšana.
 *
 * Šobrīd vienkārša precīza sakritība. Ja nākotnē būs atpakaļsaderīgas versijas,
 * šeit var ieviest plašāku savietojamības loģiku, nemainot izsaukuma vietas.
 */
export const PROTOCOL_VERSION = "1";

export function isProtocolCompatible(version: string): boolean {
  return version === PROTOCOL_VERSION;
}
