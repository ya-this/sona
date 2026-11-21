export type ClassValue = string | number | boolean | null | undefined;

export function cn(...inputs: ClassValue[]): string {
  return inputs.filter((v) => typeof v === 'string' && v.trim().length > 0).join(' ');
}
