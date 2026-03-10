const { openDb, getUserByUsername, assignPetToUser } = require("../src/db");

const args = process.argv.slice(2);

function readArg(flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return args[index + 1] || null;
}

const username = readArg("--user");
const petIdArg = readArg("--pet-id");
const petName = readArg("--pet-name");

if (!username || (!petIdArg && !petName)) {
  console.error("Usage: node scripts/assign-pet.js --user <username> (--pet-id <id> | --pet-name <name>)");
  process.exit(1);
}

async function findPetId(db) {
  if (petIdArg) {
    const id = Number.parseInt(petIdArg, 10);
    if (!id) {
      throw new Error("Invalid pet id.");
    }
    return id;
  }

  return new Promise((resolve, reject) => {
    db.get(
      "SELECT id FROM pets WHERE name = ? ORDER BY id LIMIT 1",
      [petName],
      (error, row) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(row ? row.id : null);
      }
    );
  });
}

async function run() {
  const db = await openDb();
  try {
    const user = await getUserByUsername(db, username);
    if (!user) {
      throw new Error("User not found.");
    }

    const petId = await findPetId(db);
    if (!petId) {
      throw new Error("Pet not found.");
    }

    const result = await assignPetToUser(db, petId, user.id);
    if (!result.changed) {
      throw new Error("No pet updated.");
    }

    console.log(`Assigned pet ${petId} to ${username}.`);
  } finally {
    db.close();
  }
}

run().catch((error) => {
  console.error(error.message || "Failed to assign pet.");
  process.exit(1);
});
