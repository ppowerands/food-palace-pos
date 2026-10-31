/** A problem the user can fix (shown as a message). Throwing it inside a transaction rolls everything back. */
export class BusinessError extends Error {}
