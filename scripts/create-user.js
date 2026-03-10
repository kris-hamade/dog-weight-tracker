require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const args = process.argv.slice(2);
const username = args[0];
const password = args[1];
const isAdmin = args.includes("--admin");

if (!username || !password) {
  console.error("Usage: node scripts/create-user.js <username> <password> [--admin]");
  process.exit(1);
}

const dbPath = path.join(__dirname, "..", "data", "dog-weights.db");
const db = new sqlite3.Database(dbPath);

function ensureUsersTable() {
  return new Promise((resolve, reject) => {
    db.run(
      "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, password_iters INTEGER NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')))",
      (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      }
    );
  });
}

function insertUser(passwordHash, passwordSalt, passwordIters) {
  return new Promise((resolve, reject) => {
    const stmt =
      "INSERT INTO users (username, password_hash, password_salt, password_iters, is_admin) VALUES (?, ?, ?, ?, ?)";
    db.run(stmt, [username, passwordHash, passwordSalt, passwordIters, isAdmin ? 1 : 0], (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function run() {
  try {
    await ensureUsersTable();
    const salt = crypto.randomBytes(16).toString("hex");
    const iters = 310000;
    const hash = crypto.pbkdf2Sync(password, salt, iters, 32, "sha256").toString("hex");
    await insertUser(hash, salt, iters);
    console.log(`User ${username} created${isAdmin ? " (admin)" : ""}.`);
  } catch (error) {
    console.error(error.message || "Failed to create user.");
    process.exit(1);
  } finally {
    db.close();
  }
}

run();
