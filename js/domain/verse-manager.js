window.VerseManager = class VerseManager {
  constructor(stateStore) {
    this._stateStore = stateStore;
    this._locked = false;
    this._failsafeTimer = null;
  }

  setIntentional(verse) {
    this._locked = true;
    if (this._failsafeTimer) {
      clearTimeout(this._failsafeTimer);
    }
    this._failsafeTimer = setTimeout(() => {
      this.releaseLock();
    }, 1500);
    this._stateStore.batch({ currentVerse: verse });
  }

  setPassive(verse) {
    if (this._locked) return;
    this._stateStore.batch({ currentVerse: verse });
  }

  setPassivePosition(book, chapter, verse, bookName) {
    if (this._locked) return;
    const updates = { currentVerse: verse };
    if (book != null) updates.currentBook = book;
    if (chapter != null) updates.currentChapter = chapter;
    if (bookName) updates.currentBookName = bookName;
    this._stateStore.batch(updates);
  }

  releaseLock() {
    this._locked = false;
    if (this._failsafeTimer) {
      clearTimeout(this._failsafeTimer);
      this._failsafeTimer = null;
    }
  }
};
