const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "dog-weights.db");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    ensureDataDir();
    const db = new sqlite3.Database(DB_PATH, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(db);
    });
  });
}

function initDb() {
  return new Promise((resolve, reject) => {
    ensureDataDir();
    const db = new sqlite3.Database(DB_PATH, (error) => {
      if (error) {
        reject(error);
        return;
      }

      db.serialize(() => {
        db.run(
          "CREATE TABLE IF NOT EXISTS pets (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, breed TEXT NOT NULL, birth_date TEXT NOT NULL)",
          (petsError) => {
            if (petsError) {
              db.close();
              reject(petsError);
              return;
            }

            db.run(
              "CREATE TABLE IF NOT EXISTS weights (id INTEGER PRIMARY KEY AUTOINCREMENT, pet_id INTEGER NOT NULL, date TEXT NOT NULL, weight REAL NOT NULL, FOREIGN KEY (pet_id) REFERENCES pets(id))",
              (weightsError) => {
                if (weightsError) {
                  db.close();
                  reject(weightsError);
                  return;
                }

                db.run(
                  "CREATE TABLE IF NOT EXISTS pet_facts (id INTEGER PRIMARY KEY AUTOINCREMENT, pet_id INTEGER NOT NULL, question TEXT NOT NULL, answer TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (pet_id) REFERENCES pets(id))",
                  (factsError) => {
                    if (factsError) {
                      db.close();
                      reject(factsError);
                      return;
                    }

                    db.all("PRAGMA table_info(weights)", (pragmaError, rows) => {
                      if (pragmaError) {
                        db.close();
                        reject(pragmaError);
                        return;
                      }

                      const hasPetId = rows.some((row) => row.name === "pet_id");
                      if (hasPetId) {
                        db.close((closeError) => {
                          if (closeError) {
                            reject(closeError);
                            return;
                          }
                          resolve();
                        });
                        return;
                      }

                      db.run("ALTER TABLE weights ADD COLUMN pet_id INTEGER", (alterError) => {
                        if (alterError) {
                          db.close();
                          reject(alterError);
                          return;
                        }

                        db.get("SELECT id FROM pets ORDER BY id LIMIT 1", (petError, petRow) => {
                          if (petError) {
                            db.close();
                            reject(petError);
                            return;
                          }

                          if (petRow) {
                            db.run(
                              "UPDATE weights SET pet_id = ? WHERE pet_id IS NULL",
                              [petRow.id],
                              (updateError) => {
                                if (updateError) {
                                  db.close();
                                  reject(updateError);
                                  return;
                                }

                                db.close((closeError) => {
                                  if (closeError) {
                                    reject(closeError);
                                    return;
                                  }
                                  resolve();
                                });
                              }
                            );
                            return;
                          }

                          db.run(
                            "INSERT INTO pets (name, breed, birth_date) VALUES (?, ?, ?)",
                            ["My Dog", "Unknown", new Date().toISOString().split("T")[0]],
                            function insertDefaultPet(defaultError) {
                              if (defaultError) {
                                db.close();
                                reject(defaultError);
                                return;
                              }

                              db.run(
                                "UPDATE weights SET pet_id = ? WHERE pet_id IS NULL",
                                [this.lastID],
                                (updateError) => {
                                  if (updateError) {
                                    db.close();
                                    reject(updateError);
                                    return;
                                  }

                                  db.close((closeError) => {
                                    if (closeError) {
                                      reject(closeError);
                                      return;
                                    }
                                    resolve();
                                  });
                                }
                              );
                            }
                          );
                        });
                      });
                    });
                  }
                );
              }
            );
          }
        );
      });
    });
  });
}

function insertPet(db, name, breed, birthDate) {
  return new Promise((resolve, reject) => {
    const stmt = "INSERT INTO pets (name, breed, birth_date) VALUES (?, ?, ?)";

    db.run(stmt, [name, breed, birthDate], function insertCallback(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve({ id: this.lastID, name, breed, birth_date: birthDate });
    });
  });
}

function listPets(db) {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT id, name, breed, birth_date FROM pets ORDER BY name",
      (error, rows) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(rows);
      }
    );
  });
}

function getPetById(db, petId) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT id, name, breed, birth_date FROM pets WHERE id = ?",
      [petId],
      (error, row) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(row || null);
      }
    );
  });
}

function insertWeight(db, petId, date, weight) {
  return new Promise((resolve, reject) => {
    const stmt = "INSERT INTO weights (pet_id, date, weight) VALUES (?, ?, ?)";

    db.run(stmt, [petId, date, weight], function insertCallback(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve({ id: this.lastID, pet_id: petId, date, weight });
    });
  });
}

function listWeightsByPet(db, petId) {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT id, pet_id, date, weight FROM weights WHERE pet_id = ? ORDER BY date",
      [petId],
      (error, rows) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(rows);
      }
    );
  });
}

function listWeights(db) {
  return new Promise((resolve, reject) => {
    db.all("SELECT id, pet_id, date, weight FROM weights ORDER BY date", (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(rows);
    });
  });
}

function insertPetFact(db, petId, question, answer) {
  return new Promise((resolve, reject) => {
    const stmt = "INSERT INTO pet_facts (pet_id, question, answer) VALUES (?, ?, ?)";
    db.run(stmt, [petId, question, answer], function insertCallback(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve({ id: this.lastID, pet_id: petId, question, answer });
    });
  });
}

function listPetFactsByPet(db, petId) {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT id, pet_id, question, answer, created_at FROM pet_facts WHERE pet_id = ? ORDER BY created_at DESC",
      [petId],
      (error, rows) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(rows);
      }
    );
  });
}

module.exports = {
  openDb,
  initDb,
  insertPet,
  listPets,
  getPetById,
  insertWeight,
  listWeightsByPet,
  listWeights,
  insertPetFact,
  listPetFactsByPet,
};
