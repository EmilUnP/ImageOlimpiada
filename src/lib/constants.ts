export const LANGUAGES = [
  { code: 'en', name: 'English', flagCode: 'GB' },
  { code: 'ru', name: 'Russian', flagCode: 'RU' },
  { code: 'az', name: 'Azerbaijani', flagCode: 'AZ' },
] as const;

export const ENHANCEMENT_STYLES = [
  { id: 'textbook', name: 'Book question', emoji: '📚', description: 'Default — any subject, full page or crop' },
  { id: 'document', name: 'Document', emoji: '📄', description: 'Mostly text — worksheets and handouts' },
  { id: 'old', name: 'Old page', emoji: '📜', description: 'Heavily faded or damaged scans' },
  { id: 'photo', name: 'Photo', emoji: '📷', description: 'Photo inserts and non-text images' },
] as const;

export const INTENSITY_OPTIONS = [
  { id: 'low', label: 'Soft' },
  { id: 'medium', label: 'Balanced' },
  { id: 'high', label: 'Strong' },
] as const;
