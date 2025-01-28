export type SupportedLanguages = Promise<{
  translation: {
    [key: string]: {
      name: string;
      nativeName: string;
      dir: string;
    };
  };
}>;
export type TranslateResponse = Promise<{
  source: string;
  target: string;
  text: string;
}>;
export type DetectResponse = Promise<{ language: string }>;
