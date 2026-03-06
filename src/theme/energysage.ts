export const COLORS = {
  navy: '#0a2540',
  blue: '#0073e6',
  green: '#00a651',
  amber: '#f5a623',
  red: '#e63946',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray600: '#4b5563',
  gray800: '#1f2937',
  white: '#ffffff',
} as const;

export function applyTheme(): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(COLORS)) {
    root.style.setProperty(`--es-${key}`, value);
  }
}
