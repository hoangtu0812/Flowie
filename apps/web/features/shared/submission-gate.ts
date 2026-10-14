/** Runs an entire logical submission once, including its completion effects. */
export class SubmissionGate {
   private pending?: Promise<void>;

   run(operation: () => Promise<void>): Promise<void> {
      if (this.pending) return this.pending;
      this.pending = Promise.resolve()
         .then(operation)
         .finally(() => {
            this.pending = undefined;
         });
      return this.pending;
   }
}
