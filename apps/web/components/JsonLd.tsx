// JSON-LD izvade. Servera komponents ar nolūku: strukturētajiem datiem jābūt jau
// sākotnējā HTML, jo rāpotājs var neizpildīt JavaScript.
//
// `next/script` šeit NAV pareizā izvēle — tas ir optimizēts izpildāmam JavaScript, bet
// JSON-LD ir dati; Next.js dokumentācija tieši iesaka parasto `<script>` tagu.

/**
 * Serializē JSON-LD, aizstājot `<` ar tā Unicode ekvivalentu.
 *
 * `JSON.stringify` NEAIZSARGĀ pret XSS: ja kādā laukā nonāktu `</script>`, pārlūks tagu
 * aizvērtu par agru un pārējo saturu uzskatītu par HTML. Aizvietojums notiek JSON virknes
 * iekšienē, tāpēc rezultāts paliek derīgs JSON ar tieši to pašu vērtību.
 *
 * Eksportēts atsevišķi no komponenta, lai šo drošības īpašību varētu pārbaudīt tests bez
 * DOM vides.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function JsonLd({ data }: { readonly data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
