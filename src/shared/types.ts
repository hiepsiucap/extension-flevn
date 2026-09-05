export type ExtensionState = {
  authenticated: boolean;
  lastBookId: string;
  targetLanguage: string;
  subtitleEnabled: boolean;
  user?: {
    id?: string;
    name?: string;
    email?: string;
  } | null;
};

export type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
};

export type Book = {
  id: string;
  title: string;
  coverImage?: string | null;
  totalCards: number;
};

export type Translation = {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
};

export type DefinitionSuggestion = {
  text: string;
  partOfSpeech?: string;
};

export type ExampleSuggestion = {
  text: string;
  translation?: string;
};

export type WordSuggestion = {
  word: string;
  existing?: boolean;
  existingFlashcardId?: string;
  source?: "database" | "generated";
  pronunciation?: string;
  partOfSpeech?: string;
  definitions: DefinitionSuggestion[];
  translation?: string;
  examples: ExampleSuggestion[];
  audio?: { url: string };
  images?: Array<{
    url: string;
    source?: "pexels" | "unsplash" | "default" | "database";
    description?: string;
    author?: string;
    sourceUrl?: string;
  }>;
};

export type ExtensionError = {
  status: number;
  message: string;
  details?: unknown;
};

export type MessageResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ExtensionError };
