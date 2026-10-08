import { loadDesign } from "./design";
export const designById = (id: string) => loadDesign(id).title;
