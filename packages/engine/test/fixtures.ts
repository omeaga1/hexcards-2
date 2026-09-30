import type { PerkStyle } from "@hexcards/data";
import perkstyles from "@hexcards/data/fixtures/perkstyles.json";

export { conquerorPage, sampleJaxTop as jaxTop } from "@hexcards/data";

/** Rune trees from CommunityDragon, same shape as the client's `/lol-perks/v1/styles`. */
export const styles = perkstyles.styles as PerkStyle[];
