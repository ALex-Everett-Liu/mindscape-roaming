/**
 * Shared save state manager for manual-save workflows.
 * Tracks unsaved changes across sources (outliner, future plugins).
 * Coordinates Save All, Discard All, and close warnings.
 */

export interface SaveSource {
  id: string;
  getChanges: () => Map<string, unknown>;
  save: () => Promise<{ success: boolean; savedCount: number; error?: string }>;
  discard: () => Promise<{ success: boolean; discardedCount: number }>;
}

type StateChangeListener = (hasUnsaved: boolean, totalCount: number) => void;

class SaveStateManager {
  private sources = new Map<string, SaveSource>();
  private listeners = new Set<StateChangeListener>();

  register(id: string, source: Omit<SaveSource, "id">): () => void {
    this.sources.set(id, { ...source, id });
    this.notifyListeners();
    return () => {
      this.sources.delete(id);
      this.notifyListeners();
    };
  }

  hasUnsavedChanges(): boolean {
    for (const [, source] of this.sources) {
      if (source.getChanges().size > 0) return true;
    }
    return false;
  }

  getUnsavedCount(): number {
    let count = 0;
    for (const [, source] of this.sources) {
      count += source.getChanges().size;
    }
    return count;
  }

  onStateChange(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners(): void {
    const hasUnsaved = this.hasUnsavedChanges();
    const count = this.getUnsavedCount();
    for (const listener of this.listeners) {
      listener(hasUnsaved, count);
    }
  }

  async saveAll(): Promise<{
    success: boolean;
    totalSaved: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let totalSaved = 0;

    for (const [, source] of this.sources) {
      const result = await source.save();
      if (result.success) {
        totalSaved += result.savedCount;
      } else if (result.error) {
        errors.push(`${source.id}: ${result.error}`);
      }
    }

    this.notifyListeners();
    return {
      success: errors.length === 0,
      totalSaved,
      errors,
    };
  }

  async discardAll(): Promise<{
    success: boolean;
    totalDiscarded: number;
  }> {
    let totalDiscarded = 0;

    for (const [, source] of this.sources) {
      const result = await source.discard();
      if (result.success) {
        totalDiscarded += result.discardedCount;
      }
    }

    this.notifyListeners();
    return { success: true, totalDiscarded };
  }
}

export const saveStateManager = new SaveStateManager();
