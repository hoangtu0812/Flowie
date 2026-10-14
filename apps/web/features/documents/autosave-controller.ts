export type SaveSnapshot<T> = {
   draft: T;
   dirty: boolean;
   saving: boolean;
   error?: string;
};

/** Serializes writes and drains the latest draft before a save boundary resolves. */
export class AutosaveController<T> {
   private saved: string;
   private pending?: Promise<boolean>;
   private snapshot: SaveSnapshot<T>;
   private listeners = new Set<() => void>();

   constructor(
      initial: T,
      private persist: (draft: T) => Promise<unknown>
   ) {
      this.saved = JSON.stringify(initial);
      this.snapshot = { draft: initial, dirty: false, saving: false };
   }

   getSnapshot = () => this.snapshot;
   subscribe = (listener: () => void) => {
      this.listeners.add(listener);
      return () => {
         this.listeners.delete(listener);
      };
   };

   private publish(next: SaveSnapshot<T>) {
      this.snapshot = next;
      this.listeners.forEach((listener) => listener());
   }

   update(draft: T) {
      this.publish({ ...this.snapshot, draft, dirty: JSON.stringify(draft) !== this.saved });
   }

   rebase(latest: T, keepDraft: boolean) {
      if (this.pending) throw new Error('Wait for the current save to finish.');
      this.saved = JSON.stringify(latest);
      const draft = keepDraft ? this.snapshot.draft : latest;
      this.publish({ draft, dirty: JSON.stringify(draft) !== this.saved, saving: false });
   }

   flush = (): Promise<boolean> => {
      if (this.pending) return this.pending;
      if (!this.snapshot.dirty) return Promise.resolve(true);
      this.publish({ ...this.snapshot, saving: true, error: undefined });
      this.pending = this.drain().finally(() => {
         this.pending = undefined;
         this.publish({ ...this.snapshot, saving: false });
      });
      return this.pending;
   };

   private async drain(): Promise<boolean> {
      try {
         while (this.snapshot.dirty) {
            const draft = this.snapshot.draft;
            const signature = JSON.stringify(draft);
            await this.persist(draft);
            this.saved = signature;
            this.publish({
               ...this.snapshot,
               dirty: JSON.stringify(this.snapshot.draft) !== signature,
            });
         }
         return true;
      } catch (error) {
         this.publish({
            ...this.snapshot,
            error: error instanceof Error ? error.message : 'Could not save document.',
         });
         return false;
      }
   }
}
