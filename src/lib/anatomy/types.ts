export type BodyPart = {
  slug: string;
  color?: string;
  path: { left?: string[]; right?: string[]; common?: string[] };
  /** Optional SVG transform applied to the whole part, e.g. to resize the head. */
  transform?: string;
};
