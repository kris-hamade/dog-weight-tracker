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
    updatePetProfileDates,
    insertWeight,
    listWeightsByPet,
    insertPetFact,
    listPetFactsByPet,
    insertPetChatMessage,
    listPetChatMessagesByPet,
    insertPetMemoryItem,
    listPetMemoryItemsByPet,
    upsertPetAdviceCache,
    getPetAdviceCacheByPet,
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
    const { name, breed, birthDate, dietStartDate } = req.body;

    if (!name || !breed || !birthDate) {
        res.status(400).json({ error: "name, breed, and birthDate are required." });
        return;
    }

    try {
        const db = await openDb();
        const pet = await insertPet(db, req.user.id, name, breed, birthDate, dietStartDate || null);
        res.status(201).json(pet);
    } catch (error) {
        res.status(500).json({ error: "Failed to save pet." });
    }
});

app.patch("/api/pets/:petId", async (req, res) => {
    const petId = Number.parseInt(req.params.petId, 10);
    const hasBirthDate = typeof req.body.birthDate === "string";
    const hasDietStartDate = Object.prototype.hasOwnProperty.call(req.body, "dietStartDate");
    const { birthDate, dietStartDate } = req.body;

    if (!petId || (!hasBirthDate && !hasDietStartDate)) {
        res.status(400).json({ error: "petId and at least one update field are required." });
        return;
    }

    try {
        const db = await openDb();
        const updated = await updatePetProfileDates(db, petId, req.user.id, {
            birthDate,
            dietStartDate,
        });
        if (!updated) {
            res.status(404).json({ error: "Pet not found." });
            return;
        }
        res.json({ pet: updated });
    } catch (error) {
        res.status(500).json({ error: "Failed to update pet." });
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

function summarizeProgressSinceDate(weights, dietStartDate) {
    if (!dietStartDate) {
        return "Diet start date is not set.";
    }

    const filtered = weights.filter((entry) => entry.date >= dietStartDate);
    if (!filtered.length) {
        return `No weigh-ins recorded since diet start date (${dietStartDate}).`;
    }
    if (filtered.length === 1) {
        return `Only one weigh-in exists since diet start date (${dietStartDate}). Add another to measure progress.`;
    }

    const first = filtered[0];
    const last = filtered[filtered.length - 1];
    const change = last.weight - first.weight;
    const days = Math.max(
        1,
        Math.round((new Date(last.date).getTime() - new Date(first.date).getTime()) / (1000 * 60 * 60 * 24))
    );
    const weeklyRate = (change / days) * 7;
    const absChange = Math.abs(change).toFixed(2);
    const absWeekly = Math.abs(weeklyRate).toFixed(2);

    if (change < -0.05) {
        return `Since diet start (${dietStartDate}), progress is down ${absChange} lb over ${days} days (~${absWeekly} lb/week).`;
    }
    if (change > 0.05) {
        return `Since diet start (${dietStartDate}), weight is up ${absChange} lb over ${days} days (~${absWeekly} lb/week).`;
    }
    return `Since diet start (${dietStartDate}), weight is stable over ${days} days.`;
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

function parseJsonObject(text) {
    try {
        return JSON.parse(text);
    } catch (error) {
        return null;
    }
}

function normalizeMemoryItems(items) {
    if (!Array.isArray(items)) {
        return [];
    }

    return items
        .map((item) => {
            if (!item || typeof item !== "object") {
                return null;
            }
            const key = String(item.key || "").trim();
            const value = String(item.value || "").trim();
            if (!key || !value) {
                return null;
            }
            return { key, value };
        })
        .filter(Boolean)
        .slice(0, 8);
}

function formatMemory(memoryItems) {
    if (!memoryItems.length) {
        return "none";
    }
    return memoryItems.map((item) => `${item.memory_key}: ${item.memory_value}`).join(" | ");
}

function normalizeForSimilarity(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function tokenSet(text) {
    const tokens = normalizeForSimilarity(text)
        .split(" ")
        .filter((token) => token.length > 2);
    return new Set(tokens);
}

function jaccardSimilarity(a, b) {
    const aSet = tokenSet(a);
    const bSet = tokenSet(b);

    if (!aSet.size && !bSet.size) {
        return 1;
    }

    let intersection = 0;
    for (const token of aSet) {
        if (bSet.has(token)) {
            intersection += 1;
        }
    }
    const union = aSet.size + bSet.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

function calculateRepeatRatio(newTips, previousTips) {
    if (!newTips.length || !previousTips.length) {
        return 0;
    }

    let repeatedCount = 0;
    for (const tip of newTips) {
        let maxSimilarity = 0;
        for (const previous of previousTips) {
            const score = jaccardSimilarity(tip, previous);
            if (score > maxSimilarity) {
                maxSimilarity = score;
            }
        }
        if (maxSimilarity >= 0.55) {
            repeatedCount += 1;
        }
    }

    return repeatedCount / newTips.length;
}

async function requestAiText(apiKey, model, prompt) {
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
        throw new Error(`AI request failed: ${response.status} ${responseText}`);
    }

    let data;
    try {
        data = JSON.parse(responseText);
    } catch (parseError) {
        throw new Error(`AI response parse failed: ${responseText}`);
    }

    return extractOutputText(data);
}

async function generateAdvice({ pet, weights, facts, memoryItems, previousTips, apiKey, model, forceNovel }) {
    if (!weights.length) {
        return [];
    }

    const recent = weights.slice(-8);
    const recentText = recent.map((entry) => `${entry.date}: ${entry.weight} lb`).join("; ");
    const trendSummary = summarizeTrend(recent);
    const ageDetail = formatAgeDetail(pet.birth_date);
    const factsText = facts.length
        ? facts.map((fact) => `${fact.question} -> ${fact.answer}`).join(" | ")
        : "none";
    const memoryText = formatMemory(memoryItems);
    const progressSummary = summarizeProgressSinceDate(weights, pet.diet_start_date);
    const previousTipsText = previousTips.length
        ? previousTips.map((tip, index) => `${index + 1}. ${tip}`).join("\n")
        : "none";

    const prompt = [
        "You are a helpful assistant for dog weight loss tips.",
        "Return JSON only with shape: { \"tips\": [\"...\", ...] }.",
        "Tips must be 4-6 concise bullet-style items with actionable steps.",
        "Avoid repeating advice that was previously shown.",
        forceNovel
            ? "Generate clearly different ideas than previous tips, prioritizing new routines, new measurement habits, and new activity structures."
            : "Keep advice fresh when possible and avoid near-duplicate wording.",
        "Include at least 2 tips that contain direct links to reputable sources (AKC, AAHA, WSAVA, veterinary universities).",
        "Avoid medical claims and do not diagnose.",
        `Pet name: ${pet.name}. Breed: ${pet.breed}. Birth date: ${pet.birth_date} (age ${ageDetail}).`,
        `Recent weigh-ins: ${recentText}.`,
        `Trend summary: ${trendSummary}`,
        `Progress summary: ${progressSummary}`,
        `Diet start date: ${pet.diet_start_date || "not set"}`,
        `Saved routine facts: ${factsText}`,
        `Conversation memory: ${memoryText}`,
        "Previously shown tips to avoid repeating:",
        previousTipsText,
    ].join("\n");

    const text = await requestAiText(apiKey, model, prompt);
    let tips = parseJsonArray(text, "tips");
    if (!tips.length) {
        tips = text
            .split("\n")
            .map((line) => line.replace(/^[-*\d+.\s]+/, "").trim())
            .filter(Boolean)
            .slice(0, 6);
    }

    return tips;
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

app.get("/api/chat/history", async (req, res) => {
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

        const messages = await listPetChatMessagesByPet(db, petId, 60);
        res.json({ messages });
    } catch (error) {
        res.status(500).json({ error: "Failed to load chat history." });
    }
});

app.get("/api/memory", async (req, res) => {
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

        const items = await listPetMemoryItemsByPet(db, petId, 80);
        res.json({ items });
    } catch (error) {
        res.status(500).json({ error: "Failed to load memory." });
    }
});

app.post("/api/chat/message", async (req, res) => {
    const { petId, message } = req.body;
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    if (!petId || !message || !String(message).trim()) {
        res.status(400).json({ error: "petId and message are required." });
        return;
    }

    try {
        const db = await openDb();
        const pet = await getPetById(db, petId, req.user.id);
        if (!pet) {
            res.status(404).json({ error: "Pet not found." });
            return;
        }

        const userMessage = await insertPetChatMessage(db, petId, "user", String(message).trim());
        const weights = await listWeightsByPet(db, petId);
        const facts = await listPetFactsByPet(db, petId);
        const memoryItems = await listPetMemoryItemsByPet(db, petId, 50);
        const recentChat = await listPetChatMessagesByPet(db, petId, 12);

        let assistantPayload = {
            assistantMessage:
                "Thanks, that helps. Tell me one more detail about feeding portions or treat frequency so I can improve the advice.",
            shouldAskFollowUp: true,
            followUpQuestion: "How many treats does your dog get on a typical day?",
            memoryItems: [],
        };

        if (apiKey) {
            const weightsText = weights.length
                ? weights.slice(-8).map((entry) => `${entry.date}: ${entry.weight} lb`).join("; ")
                : "none";
            const factsText = facts.length
                ? facts.map((fact) => `${fact.question} -> ${fact.answer}`).join(" | ")
                : "none";
            const memoryText = formatMemory(memoryItems);
            const chatText = recentChat
                .map((item) => `${item.role.toUpperCase()}: ${item.content}`)
                .join("\n");

            const prompt = [
                "You are a conversational assistant helping build a healthy routine for a dog's weight management plan.",
                "Return JSON only with shape:",
                '{"assistantMessage":"...","shouldAskFollowUp":true,"followUpQuestion":"...","memoryItems":[{"key":"...","value":"..."}]}',
                "assistantMessage should be brief, practical, and empathetic.",
                "Extract up to 4 durable memory items from the latest user message.",
                "Memory keys should be short snake_case like food_brand, daily_treat_count, walk_minutes, meal_portion.",
                "If no follow-up is needed, set shouldAskFollowUp false and followUpQuestion to an empty string.",
                `Pet profile: ${pet.name}, ${pet.breed}, born ${pet.birth_date}.`,
                `Recent weights: ${weightsText}`,
                `Saved facts: ${factsText}`,
                `Saved memory: ${memoryText}`,
                "Recent chat:",
                chatText || "none",
            ].join("\n");

            const text = await requestAiText(apiKey, model, prompt);
            const parsed = parseJsonObject(text);
            if (parsed && typeof parsed === "object") {
                assistantPayload = {
                    assistantMessage: String(parsed.assistantMessage || assistantPayload.assistantMessage).trim(),
                    shouldAskFollowUp: Boolean(parsed.shouldAskFollowUp),
                    followUpQuestion: String(parsed.followUpQuestion || "").trim(),
                    memoryItems: normalizeMemoryItems(parsed.memoryItems),
                };
            }
        }

        for (const item of assistantPayload.memoryItems) {
            // eslint-disable-next-line no-await-in-loop
            await insertPetMemoryItem(db, petId, item.key, item.value, userMessage.id);
        }

        const followUp = assistantPayload.shouldAskFollowUp && assistantPayload.followUpQuestion
            ? `\n\n${assistantPayload.followUpQuestion}`
            : "";
        const assistantText = `${assistantPayload.assistantMessage}${followUp}`.trim();
        const assistantMessage = await insertPetChatMessage(db, petId, "assistant", assistantText);

        res.status(201).json({
            message: assistantMessage,
            memorySaved: assistantPayload.memoryItems.length,
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to process chat message." });
    }
});

app.get("/api/advice", async (req, res) => {
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

        const cache = await getPetAdviceCacheByPet(db, petId);
        if (!cache) {
            res.json({ tips: [], updatedAt: null, reason: "no_cache" });
            return;
        }

        res.json({ tips: cache.tips, updatedAt: cache.updated_at });
    } catch (error) {
        res.status(500).json({ error: "Failed to load advice." });
    }
});

app.post("/api/advice/refresh", async (req, res) => {
    const { petId } = req.body;
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
        if (!pet) {
            res.status(404).json({ error: "Pet not found." });
            return;
        }

        const weights = await listWeightsByPet(db, petId);
        const facts = await listPetFactsByPet(db, petId);
        const memoryItems = await listPetMemoryItemsByPet(db, petId, 80);
        const cacheBeforeRefresh = await getPetAdviceCacheByPet(db, petId);
        const previousTips = cacheBeforeRefresh?.tips || [];

        let tips = await generateAdvice({
            pet,
            weights,
            facts,
            memoryItems,
            previousTips,
            apiKey,
            model,
            forceNovel: false,
        });

        const repeatRatio = calculateRepeatRatio(tips, previousTips);
        if (tips.length && repeatRatio >= 0.5) {
            // Retry once with stronger novelty constraints when output is too repetitive.
            tips = await generateAdvice({
                pet,
                weights,
                facts,
                memoryItems,
                previousTips,
                apiKey,
                model,
                forceNovel: true,
            });
        }

        await upsertPetAdviceCache(db, petId, tips);
        const cache = await getPetAdviceCacheByPet(db, petId);

        res.json({ tips, updatedAt: cache?.updated_at || null, reason: tips.length ? undefined : "no_tips" });
    } catch (error) {
        res.status(500).json({ error: "Failed to refresh advice." });
    }
});

app.get("/api/tips", async (req, res) => {
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

        const cache = await getPetAdviceCacheByPet(db, petId);
        if (!cache) {
            res.json({ tips: [], reason: "no_cache" });
            return;
        }

        res.json({ tips: cache.tips, updatedAt: cache.updated_at });
    } catch (error) {
        res.status(500).json({ error: "Failed to load tips." });
    }
});

app.listen(PORT, async () => {
    await initDb();
    console.log(`Dog weight tracker running on http://localhost:${PORT}`);
});
