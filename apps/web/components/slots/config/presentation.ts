/**
 * Renderētāja konstantes, kas apzināti NAV `@domino-poker/core/slots`: tās ir
 * prezentācija, ne matemātika, un serverim tās nav vajadzīgas (sk. integrācijas
 * plāna §1.1).
 */

/** Auto Spin piedāvātie griezienu skaiti (UI/UX 14). */
export const AUTO_SPIN_OPTIONS = [10, 25, 50, 100] as const;

/** Dizaina atskaites izmērs; viss izkārtojums ir 1920x1080 letterbox. */
export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;
