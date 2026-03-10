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
          "CREATE TABLE IF NOT EXISTS pets (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, breed TEXT NOT NULL, birth_date TEXT NOT NULL, user_id INTEGER)",
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

                    db.run(
                      "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, password_iters INTEGER NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')))",
                      (usersError) => {
                        if (usersError) {
                          db.close();
                          reject(usersError);
                          return;
                        }

                        db.run(
                          "CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id))",
                          (sessionsError) => {
                            if (sessionsError) {
                              db.close();
                              reject(sessionsError);
                              return;
                            }

                            db.all("PRAGMA table_info(pets)", (petsPragmaError, petsRows) => {
                              if (petsPragmaError) {
                                db.close();
                                reject(petsPragmaError);
                                return;
                              }

                              const hasUserId = petsRows.some((row) => row.name === "user_id");
                              const runWeightsMigration = () => {
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
                              };

                              if (hasUserId) {
                                runWeightsMigration();
                                return;
                              }

                              db.run("ALTER TABLE pets ADD COLUMN user_id INTEGER", (alterPetsError) => {
                                if (alterPetsError) {
                                  db.close();
                                  reject(alterPetsError);
                                  return;
                                }
                                runWeightsMigration();
                              });
                            });
                          }
                        );
                      }
                    );
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

function insertPet(db, userId, name, breed, birthDate) {
  return new Promise((resolve, reject) => {
    const stmt = "INSERT INTO pets (name, breed, birth_date, user_id) VALUES (?, ?, ?, ?)";

    db.run(stmt, [name, breed, birthDate, userId], function insertCallback(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve({ id: this.lastID, name, breed, birth_date: birthDate, user_id: userId });
    });
  });
}

function listPets(db, userId) {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT id, name, breed, birth_date FROM pets WHERE user_id = ? ORDER BY name",
      [userId],
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

function getPetById(db, petId, userId) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT id, name, breed, birth_date FROM pets WHERE id = ? AND user_id = ?",
      [petId, userId],
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

function assignPetToUser(db, petId, userId) {
  return new Promise((resolve, reject) => {
    db.run("UPDATE pets SET user_id = ? WHERE id = ?", [userId, petId], function updateCallback(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve({ changed: this.changes });
    });
  });
}

function createUser(db, username, passwordHash, passwordSalt, passwordIters, isAdmin) {
  return new Promise((resolve, reject) => {
    const stmt =
      "INSERT INTO users (username, password_hash, password_salt, password_iters, is_admin) VALUES (?, ?, ?, ?, ?)";

    db.run(stmt, [username, passwordHash, passwordSalt, passwordIters, isAdmin ? 1 : 0], function insertCallback(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve({ id: this.lastID, username, is_admin: isAdmin ? 1 : 0 });
    });
  });
}

function getUserByUsername(db, username) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT id, username, password_hash, password_salt, password_iters, is_admin FROM users WHERE username = ?",
      [username],
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

function getUserById(db, userId) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT id, username, is_admin FROM users WHERE id = ?",
      [userId],
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

function createSession(db, userId, tokenHash, expiresAt) {
  return new Promise((resolve, reject) => {
    const stmt = "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)";
    db.run(stmt, [userId, tokenHash, expiresAt], function insertCallback(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve({ id: this.lastID, user_id: userId, token_hash: tokenHash, expires_at: expiresAt });
    });
  });
}

function getSessionWithUser(db, tokenHash) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT s.id as session_id, s.user_id, s.expires_at, u.username, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
      [tokenHash],
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

function deleteSessionByTokenHash(db, tokenHash) {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM sessions WHERE token_hash = ?", [tokenHash], (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function deleteExpiredSessions(db) {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM sessions WHERE expires_at <= datetime('now')", (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
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
  assignPetToUser,
  createUser,
  getUserByUsername,
  getUserById,
  createSession,
  getSessionWithUser,
  deleteSessionByTokenHash,
  deleteExpiredSessions,
};
