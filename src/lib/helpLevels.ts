import type { HelpLevel } from '../types/auth';

export const HELP_LEVEL_ORDER: Record<HelpLevel, number> = {
  novice: 0,
  intermediate: 1,
  expert: 2,
};

export const HELP_LEVEL_OPTIONS: {
  value: HelpLevel;
  label: string;
  description: string;
}[] = [
  {
    value: 'novice',
    label: 'Guided',
    description: 'More tips and short explanations across the platform.',
  },
  {
    value: 'intermediate',
    label: 'Balanced',
    description: 'Only core tips and reduced explanation density.',
  },
  {
    value: 'expert',
    label: 'Minimal',
    description: 'Only critical/product-specific tips with concise copy.',
  },
];

export function isHelpLevel(value: unknown): value is HelpLevel {
  return value === 'novice' || value === 'intermediate' || value === 'expert';
}
