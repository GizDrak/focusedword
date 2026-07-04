window.IDBMigration = {
  async migrateIdsToUUIDs(db, storeName) {
    const items = await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    const needsMigration = items.filter(item => typeof item.id !== 'string');
    if (!needsMigration.length) return;
    for (const item of needsMigration) {
      const oldId = item.id;
      item.id = window.UUID.generate();
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      await new Promise((resolve, reject) => {
        const delReq = store.delete(oldId);
        delReq.onsuccess = () => {
          const addReq = store.add(item);
          addReq.onsuccess = () => resolve();
          addReq.onerror = () => reject(addReq.error);
        };
        delReq.onerror = () => reject(delReq.error);
      });
    }
  }
};