export interface DetectedText {
  id: string;
  text: string;
  confidence: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface TranslatedText extends DetectedText {
  translatedText: string;
}
