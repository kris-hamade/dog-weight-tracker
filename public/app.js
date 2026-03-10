const form = document.getElementById("weightForm");
const dateInput = document.getElementById("dateInput");
const weightInput = document.getElementById("weightInput");
const entriesList = document.getElementById("entriesList");
const latestWeight = document.getElementById("latestWeight");
const latestDate = document.getElementById("latestDate");
const petSelect = document.getElementById("petSelect");
const petDetails = document.getElementById("petDetails");
const petForm = document.getElementById("petForm");
const petNameInput = document.getElementById("petNameInput");
const petBreedInput = document.getElementById("petBreedInput");
const petBirthInput = document.getElementById("petBirthInput");
const tipsList = document.getElementById("tipsList");
const tipsStatus = document.getElementById("tipsStatus");
const activePetLabel = document.getElementById("activePetLabel");
const generateQuestionsBtn = document.getElementById("generateQuestionsBtn");
const questionsList = document.getElementById("questionsList");
const questionsStatus = document.getElementById("questionsStatus");
const factsForm = document.getElementById("factsForm");
const factsList = document.getElementById("factsList");
const userName = document.getElementById("userName");
const logoutBtn = document.getElementById("logoutBtn");
const adminLink = document.getElementById("adminLink");
const authGate = document.getElementById("authGate");
const appShell = document.getElementById("appShell");
const signupForm = document.getElementById("signupForm");
const signupUsername = document.getElementById("signupUsername");
const signupPassword = document.getElementById("signupPassword");
const signupStatus = document.getElementById("signupStatus");
const showSignupBtn = document.getElementById("showSignupBtn");
const showLoginBtn = document.getElementById("showLoginBtn");
const signupPanel = document.getElementById("signupPanel");
const loginPanel = document.getElementById("loginPanel");
const inlineLoginForm = document.getElementById("inlineLoginForm");
const inlineLoginUsername = document.getElementById("inlineLoginUsername");
const inlineLoginPassword = document.getElementById("inlineLoginPassword");
const inlineLoginStatus = document.getElementById("inlineLoginStatus");

let chart;
let pets = [];
let activePetId = null;
let pendingQuestions = [];

async function fetchMe() {
  const response = await fetch("/api/me");
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Unable to load user.");
  }
  const data = await response.json();
  return data.user;
}

async function createAccount(payload) {
  const response = await fetch("/api/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Unable to create account.");
  }
  return response.json();
}

async function signIn(payload) {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Sign in failed.");
  }
  return response.json();
}

function formatDateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString();
}

function formatAge(birthDate) {
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) {
    return "Unknown age";
  }
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    years -= 1;
  }
  return `${years} year${years === 1 ? "" : "s"} old`;
}

function setActivePet(petId) {
  activePetId = petId ? Number.parseInt(petId, 10) : null;
  const pet = pets.find((item) => item.id === activePetId);
  if (!pet) {
    petDetails.textContent = "Add a pet to start tracking.";
    activePetLabel.textContent = "Add a pet to start logging weigh-ins.";
    form.querySelector("button").disabled = true;
    tipsStatus.textContent = "Add a pet to get tips.";
    generateQuestionsBtn.disabled = true;
    questionsStatus.textContent = "Add a pet to generate questions.";
    pendingQuestions = [];
    renderQuestions([]);
    return;
  }
  petDetails.textContent = `${pet.breed} · ${formatAge(pet.birth_date)}`;
  activePetLabel.textContent = `Logging for ${pet.name}`;
  form.querySelector("button").disabled = false;
  generateQuestionsBtn.disabled = false;
  questionsStatus.textContent = "";
  pendingQuestions = [];
  renderQuestions([]);
}

function updateLatest(records) {
  if (!records.length) {
    latestWeight.textContent = "--";
    latestDate.textContent = "No entries yet";
    return;
  }

  const latest = records[records.length - 1];
  latestWeight.textContent = `${latest.weight} lb`;
  latestDate.textContent = formatDateLabel(latest.date);
}

function renderEntries(records) {
  entriesList.innerHTML = "";
  const reversed = [...records].reverse();

  reversed.forEach((record) => {
    const item = document.createElement("li");
    item.className = "entry";
    item.innerHTML = `<span>${formatDateLabel(record.date)}</span><span>${record.weight} lb</span>`;
    entriesList.appendChild(item);
  });
}

function renderChart(records) {
  const labels = records.map((record) => formatDateLabel(record.date));
  const data = records.map((record) => record.weight);

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.update();
    return;
  }

  const ctx = document.getElementById("weightChart").getContext("2d");
  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Weight (lb)",
          data,
          borderColor: "#c9922e",
          backgroundColor: "rgba(201, 146, 46, 0.18)",
          fill: true,
          tension: 0.25,
          pointRadius: 4,
          pointBackgroundColor: "#11110f",
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
        },
        y: {
          ticks: {
            callback: (value) => `${value} lb`,
          },
        },
      },
    },
  });
}

function renderTips(tips) {
  tipsList.innerHTML = "";
  if (!tips) {
    return;
  }
  if (!tips.length) {
    tipsStatus.textContent = "No tips yet. Add a few weigh-ins.";
    return;
  }
  tipsStatus.textContent = "";
  tips.forEach((tip) => {
    const item = document.createElement("li");
    appendTextWithLinks(item, tip);
    tipsList.appendChild(item);
  });
}

function appendTextWithLinks(container, text) {
  const regex = /(https?:\/\/[^\s]+)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    const rawUrl = match[0];
    const cleanUrl = rawUrl.replace(/[),.]+$/, "");
    const trailing = rawUrl.slice(cleanUrl.length);
    const link = document.createElement("a");
    link.href = cleanUrl;
    link.textContent = cleanUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    container.appendChild(link);
    if (trailing) {
      container.appendChild(document.createTextNode(trailing));
    }

    lastIndex = match.index + rawUrl.length;
  }

  if (lastIndex < text.length) {
    container.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function renderQuestions(questions) {
  questionsList.innerHTML = "";
  if (!questions.length) {
    questionsStatus.textContent = "No questions yet.";
    return;
  }
  questionsStatus.textContent = "";
  questions.forEach((question, index) => {
    const wrapper = document.createElement("label");
    wrapper.className = "question-item";
    wrapper.textContent = question;
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Type your answer";
    input.dataset.questionIndex = String(index);
    wrapper.appendChild(input);
    questionsList.appendChild(wrapper);
  });
}

function renderFacts(facts) {
  factsList.innerHTML = "";
  if (!facts.length) {
    const item = document.createElement("li");
    item.className = "fact-item";
    item.textContent = "No saved answers yet.";
    factsList.appendChild(item);
    return;
  }
  facts.forEach((fact) => {
    const item = document.createElement("li");
    item.className = "fact-item";
    item.innerHTML = `<strong>${fact.question}</strong><span>${fact.answer}</span>`;
    factsList.appendChild(item);
  });
}

async function fetchPets() {
  const response = await fetch("/api/pets");
  if (!response.ok) {
    return [];
  }
  return response.json();
}

async function createPet(payload) {
  const response = await fetch("/api/pets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Unable to save pet.");
  }
  return response.json();
}

async function fetchWeights() {
  if (!activePetId) {
    return [];
  }
  const response = await fetch(`/api/weights?petId=${activePetId}`);
  if (!response.ok) {
    return [];
  }
  return response.json();
}

async function fetchFacts() {
  if (!activePetId) {
    return [];
  }
  const response = await fetch(`/api/facts?petId=${activePetId}`);
  if (!response.ok) {
    return [];
  }
  return response.json();
}

async function fetchQuestions() {
  if (!activePetId) {
    return [];
  }
  const response = await fetch(`/api/questions?petId=${activePetId}`);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    questionsStatus.textContent = data?.error || "Unable to generate questions.";
    return [];
  }
  const data = await response.json();
  return data.questions || [];
}

async function saveFacts(items) {
  const response = await fetch("/api/facts/bulk", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      petId: activePetId,
      items,
    }),
  });
  if (!response.ok) {
    throw new Error("Unable to save facts.");
  }
  return response.json();
}

async function fetchTips() {
  if (!activePetId) {
    return [];
  }
  const response = await fetch(`/api/tips?petId=${activePetId}`);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    tipsStatus.textContent = data?.error || "Tips unavailable. Check API key.";
    return { tips: null };
  }
  const data = await response.json();
  if (data.reason === "no_weights") {
    tipsStatus.textContent = "Add a few weigh-ins to generate tips.";
  } else if (data.reason === "no_tips") {
    tipsStatus.textContent = "No tips returned. Try again.";
  }
  return { tips: data.tips || [] };
}

async function refresh() {
  if (!activePetId) {
    updateLatest([]);
    renderEntries([]);
    renderChart([]);
    renderTips(null);
    pendingQuestions = [];
    renderQuestions([]);
    renderFacts([]);
    return;
  }
  const records = await fetchWeights();
  updateLatest(records);
  renderEntries(records);
  renderChart(records);
  const tipsPayload = await fetchTips();
  renderTips(tipsPayload?.tips ?? null);
  const facts = await fetchFacts();
  renderFacts(facts);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!activePetId) {
    alert("Add a pet before logging weigh-ins.");
    return;
  }

  const payload = {
    petId: activePetId,
    date: dateInput.value,
    weight: Number.parseFloat(weightInput.value),
  };

  const response = await fetch("/api/weights", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    alert("Unable to save the weigh-in. Please try again.");
    return;
  }

  form.reset();
  await refresh();
});

petSelect.addEventListener("change", async (event) => {
  setActivePet(event.target.value);
  tipsStatus.textContent = "Loading tips...";
  await refresh();
});

generateQuestionsBtn.addEventListener("click", async () => {
  if (!activePetId) {
    return;
  }
  questionsStatus.textContent = "Generating questions...";
  pendingQuestions = await fetchQuestions();
  renderQuestions(pendingQuestions);
});

factsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!pendingQuestions.length) {
    questionsStatus.textContent = "Generate questions first.";
    return;
  }
  const inputs = Array.from(questionsList.querySelectorAll("input"));
  const items = inputs
    .map((input) => {
      const index = Number.parseInt(input.dataset.questionIndex, 10);
      return {
        question: pendingQuestions[index],
        answer: input.value.trim(),
      };
    })
    .filter((item) => item.answer);

  if (!items.length) {
    questionsStatus.textContent = "Add at least one answer before saving.";
    return;
  }

  try {
    await saveFacts(items);
    pendingQuestions = [];
    renderQuestions([]);
    questionsStatus.textContent = "Saved.";
    await refresh();
  } catch (error) {
    questionsStatus.textContent = "Unable to save answers.";
  }
});

petForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    name: petNameInput.value.trim(),
    breed: petBreedInput.value.trim(),
    birthDate: petBirthInput.value,
  };

  try {
    const pet = await createPet(payload);
    pets.push(pet);
    renderPetOptions();
    petSelect.value = pet.id;
    setActivePet(pet.id);
    petForm.reset();
    await refresh();
  } catch (error) {
    alert("Unable to save the pet. Please try again.");
  }
});

function renderPetOptions() {
  petSelect.innerHTML = "";
  if (!pets.length) {
    const option = document.createElement("option");
    option.textContent = "No pets yet";
    option.value = "";
    petSelect.appendChild(option);
    return;
  }

  pets.forEach((pet) => {
    const option = document.createElement("option");
    option.value = pet.id;
    option.textContent = pet.name;
    petSelect.appendChild(option);
  });
}

const today = new Date();
dateInput.value = today.toISOString().split("T")[0];
petBirthInput.value = today.toISOString().split("T")[0];

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.reload();
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  signupStatus.textContent = "Creating account...";
  try {
    await createAccount({
      username: signupUsername.value.trim(),
      password: signupPassword.value,
    });
    window.location.reload();
  } catch (error) {
    signupStatus.textContent = error.message;
  }
});

inlineLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  inlineLoginStatus.textContent = "Signing in...";
  try {
    await signIn({
      username: inlineLoginUsername.value.trim(),
      password: inlineLoginPassword.value,
    });
    window.location.reload();
  } catch (error) {
    inlineLoginStatus.textContent = error.message;
  }
});

function setAuthMode(mode) {
  const showSignup = mode === "signup";
  signupPanel.hidden = !showSignup;
  loginPanel.hidden = showSignup;
  showSignupBtn.classList.toggle("is-active", showSignup);
  showLoginBtn.classList.toggle("is-active", !showSignup);
}

showSignupBtn.addEventListener("click", () => setAuthMode("signup"));
showLoginBtn.addEventListener("click", () => setAuthMode("login"));

async function boot() {
  authGate.hidden = false;
  appShell.hidden = true;
  try {
    const user = await fetchMe();
    if (!user) {
      authGate.hidden = false;
      appShell.hidden = true;
      setAuthMode("signup");
      return;
    }
    authGate.hidden = true;
    appShell.hidden = false;
    userName.textContent = user.username;
    if (user.is_admin) {
      adminLink.hidden = false;
    }
  } catch (error) {
    userName.textContent = "Unknown";
  }
  pets = await fetchPets();
  renderPetOptions();
  const initialId = pets.length ? pets[0].id : null;
  if (initialId) {
    petSelect.value = initialId;
  }
  setActivePet(initialId);
  tipsStatus.textContent = pets.length ? "Loading tips..." : "Add a pet to get tips.";
  await refresh();
}

boot();
