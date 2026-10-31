export type ContentStatus = 'demo' | 'placeholder' | 'approved';

/** A versioned topic-independent quiz; questions are stored separately. */
export interface Quiz {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly topic: string;
  readonly difficulty: 'beginner' | 'intermediate' | 'advanced';
  readonly questionIds: readonly string[];
  readonly defaultTimeLimitSeconds: number;
  readonly status: ContentStatus;
}
