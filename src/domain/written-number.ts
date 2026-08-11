const DECIMAL = 10;

export const numberIn = (written: string | undefined): number | null => {
  const value = Number.parseInt(written ?? "", DECIMAL);

  return Number.isNaN(value) ? null : value;
};

export const numberOr = (written: string | undefined, fallback: number): number =>
  numberIn(written) ?? fallback;
