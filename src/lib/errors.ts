export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'AppError';
  }
}
export class DuplicateSeqError extends Error {
  constructor() { super('Audit sequence already taken'); this.name = 'DuplicateSeqError'; }
}
