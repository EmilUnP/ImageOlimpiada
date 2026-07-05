export const LANGUAGES = [
  { code: 'en', name: 'English', emoji: '🇬🇧' },
  { code: 'ru', name: 'Russian', emoji: '🇷🇺' },
  { code: 'az', name: 'Azerbaijani', emoji: '🇦🇿' },
] as const;

export const ENHANCEMENT_STYLES = [
  { id: 'textbook', name: 'Book question', emoji: '📚', description: 'Old scanned exam questions from Russian textbooks' },
  { id: 'document', name: 'Document', emoji: '📄', description: 'Text pages, worksheets, and handouts' },
  { id: 'old', name: 'Old page', emoji: '📜', description: 'Heavily faded or damaged book pages' },
  { id: 'photo', name: 'Photo', emoji: '📷', description: 'General image fallback' },
] as const;

export const INTENSITY_OPTIONS = [
  { id: 'low', label: 'Soft' },
  { id: 'medium', label: 'Balanced' },
  { id: 'high', label: 'Strong' },
] as const;
