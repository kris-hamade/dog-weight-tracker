require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const {
    openDb,
    initDb,
    insertPet,
    listPets,
    getPetById,
    insertWeight,
    listWeightsByPet,
    insertPetFact,
    listPetFactsByPet,
    createUser,
    getUserByUsername,
    createSession,
    getSessionWithUser,
    deleteSessionByTokenHash,
    deleteExpiredSessions,
} = require("./src/db");

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_COOKIE = "session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const SESSION_SECRET = process.env.SESSION_SECRET || "";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public"), { index: false }));

function parseCookies(header) {
    if (!header) {
        return {};
    }
    return header.split(";").reduce((acc, part) => {
        const [rawKey, ...rawValue] = part.trim().split("=");
        if (!rawKey) {
            return acc;
        }
        acc[rawKey] = decodeURIComponent(rawValue.join("="));
        return acc;
    }, {});
}

function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function signToken(token) {
    return crypto.createHmac("sha256", SESSION_SECRET).update(token).digest("hex");
}

function timingSafeEqual(a, b) {
    if (a.length !== b.length) {
        return false;
    }
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function setSessionCookie(res, token) {
    const signature = signToken(token);
    const cookieValue = `${token}.${signature}`;
    const parts = [
        `${SESSION_COOKIE}=${cookieValue}`,
        "HttpOnly",
        "SameSite=Lax",
        "Path=/",
        `Max-Age=${SESSION_TTL_SECONDS}`,
    ];
    if (process.env.NODE_ENV === "production") {
        parts.push("Secure");
    }
    res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
    res.setHeader(
        "Set-Cookie",
        `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
    );
}

async function getAuthUser(req) {
    if (!SESSION_SECRET) {
        return null;
    }

    const cookies = parseCookies(req.headers.cookie);
    const rawToken = cookies[SESSION_COOKIE];
    if (!rawToken) {
        return null;
    }

    const [token, signature] = rawToken.split(".");
    if (!token || !signature) {
        return null;
    }

    const expected = signToken(token);
    if (!timingSafeEqual(signature, expected)) {
        return null;
    }

    const tokenHash = hashToken(token);
    const db = await openDb();
    await deleteExpiredSessions(db);
    const session = await getSessionWithUser(db, tokenHash);
    if (!session) {
        return null;
    }

    const expiresAt = new Date(session.expires_at).getTime();
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
        await deleteSessionByTokenHash(db, tokenHash);
        return null;
    }

    return {
        id: session.user_id,
        username: session.username,
        is_admin: Boolean(session.is_admin),
        tokenHash,
    };
}

function requireAuth(req, res, next) {
    getAuthUser(req)
        .then((user) => {
            if (!user) {
                res.status(401).json({ error: "Authentication required." });
                return;
            }
            req.user = user;
            next();
        })
        .catch(() => {
            res.status(500).json({ error: "Authentication failed." });
        });
}

function requireAdmin(req, res, next) {
    getAuthUser(req)
        .then((user) => {
            if (!user) {
                res.status(401).json({ error: "Authentication required." });
                return;
            }
            if (!user.is_admin) {
                res.status(403).json({ error: "Admin access required." });
                return;
            }
            req.user = user;
            next();
        })
        .catch(() => {
            res.status(500).json({ error: "Authentication failed." });
        });
}

function requirePageAuth(req, res, next) {
    getAuthUser(req)
        .then((user) => {
            if (!user) {
                res.redirect("/login");
                return;
            }
            req.user = user;
            next();
        })
        .catch(() => {
            res.status(500).send("Authentication failed.");
        });
}

function requireAdminPage(req, res, next) {
    getAuthUser(req)
        .then((user) => {
            if (!user) {
                res.redirect("/login");
                return;
            }
            if (!user.is_admin) {
                res.status(403).send("Admin access required.");
                return;
            }
            req.user = user;
            next();
        })
        .catch(() => {
            res.status(500).send("Authentication failed.");
        });
}

app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/login", (_req, res) => {
    res.redirect("/");
});

app.get("/admin", requireAdminPage, (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;

    if (!SESSION_SECRET) {
        res.status(500).json({ error: "Missing SESSION_SECRET." });
        return;
    }

    if (!username || !password) {
        res.status(400).json({ error: "username and password are required." });
        return;
    }

    try {
        const db = await openDb();
        const user = await getUserByUsername(db, username.trim());
        if (!user) {
            res.status(401).json({ error: "Invalid credentials." });
            return;
        }

        const hash = crypto
            .pbkdf2Sync(password, user.password_salt, user.password_iters, 32, "sha256")
            .toString("hex");
        if (!timingSafeEqual(hash, user.password_hash)) {
            res.status(401).json({ error: "Invalid credentials." });
            return;
        }

        const token = crypto.randomBytes(32).toString("hex");
        const tokenHash = hashToken(token);
        const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
        await createSession(db, user.id, tokenHash, expiresAt);

        setSessionCookie(res, token);
        res.json({
            user: {
                id: user.id,
                username: user.username,
                is_admin: Boolean(user.is_admin),
            },
        });
    } catch (error) {
        res.status(500).json({ error: "Login failed." });
    }
});

app.post("/api/signup", async (req, res) => {
    const { username, password } = req.body;

    if (!SESSION_SECRET) {
        res.status(500).json({ error: "Missing SESSION_SECRET." });
        return;
    }

    if (!username || !password) {
        res.status(400).json({ error: "username and password are required." });
        return;
    }

    try {
        const db = await openDb();
        const existing = await getUserByUsername(db, username.trim());
        if (existing) {
            res.status(409).json({ error: "Username already exists." });
            return;
        }

        const salt = crypto.randomBytes(16).toString("hex");
        const iters = 310000;
        const hash = crypto.pbkdf2Sync(password, salt, iters, 32, "sha256").toString("hex");
        const user = await createUser(db, username.trim(), hash, salt, iters, false);

        const token = crypto.randomBytes(32).toString("hex");
        const tokenHash = hashToken(token);
        const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
        await createSession(db, user.id, tokenHash, expiresAt);
        setSessionCookie(res, token);

        res.status(201).json({
            user: {
                id: user.id,
                username: user.username,
                is_admin: false,
            },
        });
    } catch (error) {
        res.status(500).json({ error: "Signup failed." });
    }
});

app.post("/api/logout", requireAuth, async (req, res) => {
    try {
        const db = await openDb();
        await deleteSessionByTokenHash(db, req.user.tokenHash);
        clearSessionCookie(res);
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: "Logout failed." });
    }
});

app.get("/api/me", requireAuth, (req, res) => {
    res.json({
        user: {
            id: req.user.id,
            username: req.user.username,
            is_admin: req.user.is_admin,
        },
    });
});

app.post("/api/users", requireAdmin, async (req, res) => {
    const { username, password, isAdmin } = req.body;
    if (!username || !password) {
        res.status(400).json({ error: "username and password are required." });
        return;
    }

    try {
        const salt = crypto.randomBytes(16).toString("hex");
        const iters = 310000;
        const hash = crypto.pbkdf2Sync(password, salt, iters, 32, "sha256").toString("hex");
        const db = await openDb();
        const user = await createUser(db, username.trim(), hash, salt, iters, Boolean(isAdmin));
        res.status(201).json({ user });
    } catch (error) {
        res.status(500).json({ error: "Unable to create user." });
    }
});

app.use("/api", requireAuth);

app.get("/api/pets", async (req, res) => {
    try {
        const db = await openDb();
        const pets = await listPets(db, req.user.id);
        res.json(pets);
    } catch (error) {
        res.status(500).json({ error: "Failed to load pets." });
    }
});

app.post("/api/pets", async (req, res) => {
    const { name, breed, birthDate } = req.body;

    if (!name || !breed || !birthDate) {
        res.status(400).json({ error: "name, breed, and birthDate are required." });
        return;
    }

    try {
        const db = await openDb();
        const pet = await insertPet(db, req.user.id, name, breed, birthDate);
        res.status(201).json(pet);
    } catch (error) {
        res.status(500).json({ error: "Failed to save pet." });
    }
});

app.get("/api/weights", async (req, res) => {
    const petId = Number.parseInt(req.query.petId, 10);

    if (!petId) {
        res.status(400).json({ error: "petId is required." });
        return;
    }

    try {
        const db = await openDb();
        const pet = await getPetById(db, petId, req.user.id);
        if (!pet) {
            res.status(404).json({ error: "Pet not found." });
            return;
        }
        const rows = await listWeightsByPet(db, petId);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: "Failed to load weights." });
    }
});

app.post("/api/weights", async (req, res) => {
    const { petId, date, weight } = req.body;

    if (!petId || !date || typeof weight !== "number") {
        res.status(400).json({ error: "petId, date, and numeric weight are required." });
        return;
    }

    try {
        const db = await openDb();
        const pet = await getPetById(db, petId, req.user.id);
        if (!pet) {
            res.status(404).json({ error: "Pet not found." });
            return;
        }
        const record = await insertWeight(db, petId, date, weight);
        res.status(201).json(record);
    } catch (error) {
        res.status(500).json({ error: "Failed to save weight." });
    }
});

app.get("/api/facts", async (req, res) => {
    const petId = Number.parseInt(req.query.petId, 10);

    if (!petId) {
        res.status(400).json({ error: "petId is required." });
        return;
    }

    try {
        const db = await openDb();
        const pet = await getPetById(db, petId, req.user.id);
        if (!pet) {
            res.status(404).json({ error: "Pet not found." });
            return;
        }
        const facts = await listPetFactsByPet(db, petId);
        res.json(facts);
    } catch (error) {
        res.status(500).json({ error: "Failed to load facts." });
    }
});

app.post("/api/facts/bulk", async (req, res) => {
    const { petId, items } = req.body;

    if (!petId || !Array.isArray(items) || !items.length) {
        res.status(400).json({ error: "petId and items are required." });
        return;
    }

    try {
        const db = await openDb();
        const pet = await getPetById(db, petId, req.user.id);
        if (!pet) {
            res.status(404).json({ error: "Pet not found." });
            return;
        }
        const saved = [];
        for (const item of items) {
            if (!item.question || !item.answer) {
                continue;
            }
            // eslint-disable-next-line no-await-in-loop
            const row = await insertPetFact(db, petId, item.question, item.answer);
            saved.push(row);
        }
        res.status(201).json(saved);
    } catch (error) {
        res.status(500).json({ error: "Failed to save facts." });
    }
});

function formatAgeDetail(birthDate) {
    const birth = new Date(birthDate);
    if (Number.isNaN(birth.getTime())) {
        return "Unknown";
    }
    const today = new Date();
    let years = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        years -= 1;
    }
    const months = (today.getMonth() - birth.getMonth() + 12) % 12;
    return `${years}y ${months}m`;
}

function summarizeTrend(weights) {
    if (weights.length < 2) {
        return "Not enough data to compute a trend.";
    }
    const first = weights[0];
    const last = weights[weights.length - 1];
    const change = (last.weight - first.weight).toFixed(2);
    const direction = Number.parseFloat(change) > 0 ? "up" : Number.parseFloat(change) < 0 ? "down" : "flat";
    return `From ${first.date} (${first.weight} lb) to ${last.date} (${last.weight} lb): ${direction} ${change} lb.`;
}

function extractOutputText(data) {
    if (data.output_text) {
        return data.output_text;
    }
    if (!Array.isArray(data.output)) {
        return "";
    }
    const message = data.output.find((item) => item.type === "message");
    if (!message || !Array.isArray(message.content)) {
        return "";
    }
    const textParts = message.content
        .filter((part) => part.type === "output_text" && typeof part.text === "string")
        .map((part) => part.text.trim())
        .filter(Boolean);
    return textParts.join("\n");
}

function parseJsonArray(text, key) {
    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed[key])) {
            return parsed[key].map((item) => String(item).trim()).filter(Boolean);
        }
    } catch (error) {
        return [];
    }
    return [];
}

app.get("/api/questions", async (req, res) => {
    const petId = Number.parseInt(req.query.petId, 10);
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    if (!petId) {
        res.status(400).json({ error: "petId is required." });
        return;
    }

    if (!apiKey) {
        res.status(501).json({ error: "Missing OPENAI_API_KEY." });
        return;
    }

    try {
        const db = await openDb();
        const pet = await getPetById(db, petId, req.user.id);
        const facts = await listPetFactsByPet(db, petId);

        if (!pet) {
            res.status(404).json({ error: "Pet not found." });
            return;
        }

        const factsText = facts.length
            ? facts.map((fact) => `${fact.question} -> ${fact.answer}`).join(" | ")
            : "none";
        const prompt = [
            "You are helping collect routine details for a dog's weight loss plan.",
            "Return JSON only with shape: { \"questions\": [\"...\", ...] }.",
            "Ask 3-5 short questions that fill missing info about treats, food brand, portion size, feeding schedule, exercise, and activity level.",
            "Avoid repeating facts that are already answered.",
            `Pet name: ${pet.name}. Breed: ${pet.breed}. Birth date: ${pet.birth_date}.`,
            `Existing facts: ${factsText}.`,
        ].join("\n");

        const response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                input: prompt,
            }),
        });

        const responseText = await response.text();
        if (!response.ok) {
            res.status(502).json({ error: "AI request failed.", detail: responseText });
            return;
        }

        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            res.status(502).json({ error: "AI response parse failed.", detail: responseText });
            return;
        }

        const text = extractOutputText(data);
        const questions = parseJsonArray(text, "questions").slice(0, 5);
        res.json({ questions });
    } catch (error) {
        res.status(500).json({ error: "Failed to generate questions." });
    }
});

app.get("/api/tips", async (req, res) => {
    const petId = Number.parseInt(req.query.petId, 10);
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const debugTips = process.env.DEBUG_TIPS === "true";

    if (!petId) {
        res.status(400).json({ error: "petId is required." });
        return;
    }

    if (!apiKey) {
        res.status(501).json({ error: "Missing OPENAI_API_KEY." });
        return;
    }

    try {
        const db = await openDb();
        const pet = await getPetById(db, petId, req.user.id);
        const weights = await listWeightsByPet(db, petId);
        const facts = await listPetFactsByPet(db, petId);

        if (!pet) {
            res.status(404).json({ error: "Pet not found." });
            return;
        }

        if (!weights.length) {
            res.json({ tips: [], reason: "no_weights" });
            return;
        }

        const recent = weights.slice(-8);
        const recentText = recent.map((entry) => `${entry.date}: ${entry.weight} lb`).join("; ");
        const trendSummary = summarizeTrend(recent);
        const ageDetail = formatAgeDetail(pet.birth_date);
        const factsText = facts.length
            ? facts.map((fact) => `${fact.question} -> ${fact.answer}`).join(" | ")
            : "none";
        const prompt = [
            "You are a helpful assistant for dog weight loss tips.",
            "Return JSON only with shape: { \"tips\": [\"...\", ...] }.",
            "Tips must be 4-6 concise bullet-style items with actionable steps.",
            "Include at least 2 tips that contain direct links to reputable sources (AKC, AAHA, WSAVA, veterinary universities).",
            "Avoid medical claims and do not diagnose.",
            `Pet name: ${pet.name}. Breed: ${pet.breed}. Birth date: ${pet.birth_date} (age ${ageDetail}).`,
            `Recent weigh-ins: ${recentText}.`,
            `Trend summary: ${trendSummary}`,
            `User facts: ${factsText}`,
        ].join("\n");

        const debugInfo = debugTips
            ? {
                  model,
                  prompt,
              }
            : null;

        if (debugTips) {
            console.log("[tips] prompt", prompt);
        }

        const response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                input: prompt,
            }),
        });

        const responseText = await response.text();

        if (debugTips) {
            console.log("[tips] response status", response.status);
            console.log("[tips] response body", responseText);
        }

        if (!response.ok) {
            res.status(502).json({
                error: "AI request failed.",
                detail: responseText,
                debug: debugTips
                    ? {
                          ...debugInfo,
                          responseStatus: response.status,
                          responseText,
                      }
                    : undefined,
            });
            return;
        }

        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            res.status(502).json({
                error: "AI response parse failed.",
                detail: responseText,
                debug: debugTips
                    ? {
                          ...debugInfo,
                          responseStatus: response.status,
                          responseText,
                      }
                    : undefined,
            });
            return;
        }
        const text = extractOutputText(data);
        let tips = parseJsonArray(text, "tips");
        if (!tips.length) {
            tips = text
                .split("\n")
                .map((line) => line.replace(/^[-*\d+.\s]+/, "").trim())
                .filter(Boolean)
                .slice(0, 6);
        }

        res.json({
            tips,
            reason: tips.length ? undefined : "no_tips",
            debug: debugTips
                ? {
                      ...debugInfo,
                      responseStatus: response.status,
                      responseText,
                      outputText: text,
                  }
                : undefined,
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to generate tips." });
    }
});

app.listen(PORT, async () => {
    await initDb();
    console.log(`Dog weight tracker running on http://localhost:${PORT}`);
});
