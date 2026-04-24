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
const petDietStartInput = document.getElementById("petDietStartInput");
const petBirthEditInput = document.getElementById("petBirthEditInput");
const updatePetBirthBtn = document.getElementById("updatePetBirthBtn");
const petBirthStatus = document.getElementById("petBirthStatus");
const petDietStartEditInput = document.getElementById("petDietStartEditInput");
const updateDietStartBtn = document.getElementById("updateDietStartBtn");
const dietStartStatus = document.getElementById("dietStartStatus");
const tipsList = document.getElementById("tipsList");
const tipsStatus = document.getElementById("tipsStatus");
const refreshAdviceBtn = document.getElementById("refreshAdviceBtn");
const trendFeedback = document.getElementById("trendFeedback");
const chatList = document.getElementById("chatList");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatStatus = document.getElementById("chatStatus");
const memoryList = document.getElementById("memoryList");
const memoryStatus = document.getElementById("memoryStatus");
const activePetLabel = document.getElementById("activePetLabel");
const heroPetSelect = document.getElementById("heroPetSelect");
const weighInPetLabel = document.getElementById("weighInPetLabel");
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
const openPetProfileBtn = document.getElementById("openPetProfileBtn");
const openWeighInBtn = document.getElementById("openWeighInBtn");
const petModal = document.getElementById("petModal");
const weighInModal = document.getElementById("weighInModal");
const showChartViewBtn = document.getElementById("showChartViewBtn");
const showEntriesViewBtn = document.getElementById("showEntriesViewBtn");
const chartViewPanel = document.getElementById("chartViewPanel");
const entriesViewPanel = document.getElementById("entriesViewPanel");

let chart;
let pets = [];
let activePetId = null;
const MODAL_ANIMATION_MS = 180;
const VIEW_PANEL_ANIMATION_MS = 180;
const modalCloseTimers = new WeakMap();
let viewPanelTimer;

function syncModalBodyState() {
  const hasOpenModal = !petModal.hidden || !weighInModal.hidden;
  document.body.classList.toggle("has-modal-open", hasOpenModal);
}

function setWeightView(view) {
  const showChart = view === "chart";
  const nextPanel = showChart ? chartViewPanel : entriesViewPanel;
  const previousPanel = showChart ? entriesViewPanel : chartViewPanel;

  if (viewPanelTimer) {
    window.clearTimeout(viewPanelTimer);
  }

  nextPanel.hidden = false;
  nextPanel.classList.remove("is-leaving");
  nextPanel.classList.add("is-active");

  if (!previousPanel.hidden) {
    previousPanel.classList.remove("is-active");
    previousPanel.classList.add("is-leaving");
    viewPanelTimer = window.setTimeout(() => {
      previousPanel.hidden = true;
      previousPanel.classList.remove("is-leaving");
    }, VIEW_PANEL_ANIMATION_MS);
  } else {
    previousPanel.classList.remove("is-active");
    previousPanel.classList.remove("is-leaving");
  }

  showChartViewBtn.classList.toggle("is-active", showChart);
  showEntriesViewBtn.classList.toggle("is-active", !showChart);
  showChartViewBtn.setAttribute("aria-selected", String(showChart));
  showEntriesViewBtn.setAttribute("aria-selected", String(!showChart));
}

function openModal(modal) {
  if (!modal) {
    return;
  }

  const pendingClose = modalCloseTimers.get(modal);
  if (pendingClose) {
    window.clearTimeout(pendingClose);
    modalCloseTimers.delete(modal);
  }

  modal.hidden = false;
  window.requestAnimationFrame(() => {
    modal.classList.add("is-open");
  });
  syncModalBodyState();
}

function closeModal(modal) {
  if (!modal) {
    return;
  }

  modal.classList.remove("is-open");
  const timerId = window.setTimeout(() => {
    modal.hidden = true;
    modalCloseTimers.delete(modal);
    syncModalBodyState();
  }, MODAL_ANIMATION_MS);

  modalCloseTimers.set(modal, timerId);
}

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

function formatDateTimeLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "";
  }
  return date.toLocaleString();
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
  const activeValue = activePetId ? String(activePetId) : "";
  petSelect.value = activeValue;
  heroPetSelect.value = activeValue;

  const pet = pets.find((item) => item.id === activePetId);
  if (!pet) {
    petDetails.textContent = "Add a pet to start tracking.";
    activePetLabel.textContent = "Add a pet to start logging weigh-ins.";
    weighInPetLabel.textContent = "Add a pet to start logging weigh-ins.";
    form.querySelector("button").disabled = true;
    refreshAdviceBtn.disabled = true;
    chatInput.disabled = true;
    chatForm.querySelector("button").disabled = true;
    tipsStatus.textContent = "Add a pet to load advice.";
    chatStatus.textContent = "Add a pet to start chatting.";
    memoryStatus.textContent = "No memory yet.";
    petBirthStatus.textContent = "";
    petBirthEditInput.value = "";
    petBirthEditInput.disabled = true;
    updatePetBirthBtn.disabled = true;
    dietStartStatus.textContent = "";
    petDietStartEditInput.value = "";
    petDietStartEditInput.disabled = true;
    updateDietStartBtn.disabled = true;
    trendFeedback.textContent = "Add weigh-ins to see progress feedback.";
    renderChat([]);
    renderMemory([]);
    return;
  }

  const dietStartLabel = pet.diet_start_date
    ? `Diet started ${formatDateLabel(pet.diet_start_date)}`
    : "Diet start not set";
  petDetails.textContent = `${pet.breed} · ${formatAge(pet.birth_date)} · ${dietStartLabel}`;
  activePetLabel.textContent = `Logging for ${pet.name}`;
  weighInPetLabel.textContent = `Logging for ${pet.name}`;
  form.querySelector("button").disabled = false;
  refreshAdviceBtn.disabled = false;
  chatInput.disabled = false;
  chatForm.querySelector("button").disabled = false;
  petBirthEditInput.disabled = false;
  updatePetBirthBtn.disabled = false;
  petBirthEditInput.value = pet.birth_date || "";
  petBirthStatus.textContent = "";
  petDietStartEditInput.disabled = false;
  updateDietStartBtn.disabled = false;
  petDietStartEditInput.value = pet.diet_start_date || "";
  dietStartStatus.textContent = "";
  chatStatus.textContent = "";
}

function computeTrendFeedback(records, pet) {
  if (!records.length) {
    return "Add weigh-ins to see progress feedback.";
  }

  const dietStartDate = pet?.diet_start_date || "";
  const scopedRecords = dietStartDate
    ? records.filter((record) => record.date >= dietStartDate)
    : records;

  if (!dietStartDate) {
    return "Set a diet start date to track progress against your plan baseline.";
  }

  if (!scopedRecords.length) {
    return `No weigh-ins since diet start date (${formatDateLabel(dietStartDate)}).`;
  }

  if (scopedRecords.length === 1) {
    return "One weigh-in logged. Add another entry to calculate progress.";
  }

  const first = scopedRecords[0];
  const last = scopedRecords[scopedRecords.length - 1];
  const change = last.weight - first.weight;
  const days = Math.max(
    1,
    Math.round(
      (new Date(last.date).getTime() - new Date(first.date).getTime()) / (1000 * 60 * 60 * 24)
    )
  );
  const weeklyRate = (change / days) * 7;
  const absChange = Math.abs(change).toFixed(2);
  const absWeekly = Math.abs(weeklyRate).toFixed(2);
  const percent = Math.abs((change / first.weight) * 100).toFixed(1);

  if (change < -0.05) {
    return `Since ${formatDateLabel(dietStartDate)}: down ${absChange} lb (${percent}%) over ${days} days (~${absWeekly} lb/week).`;
  }
  if (change > 0.05) {
    return `Since ${formatDateLabel(dietStartDate)}: up ${absChange} lb (${percent}%) over ${days} days (~${absWeekly} lb/week). Consider reviewing portions, treats, and activity.`;
  }
  return `Since ${formatDateLabel(dietStartDate)}: weight is steady over ${days} days. Maintain routine or adjust gently.`;
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

function renderTips(tips) {
  tipsList.innerHTML = "";
  if (!tips) {
    return;
  }
  if (!tips.length) {
    const item = document.createElement("li");
    item.textContent = "No advice saved yet. Use Refresh advice after you add routine details.";
    tipsList.appendChild(item);
    return;
  }

  tips.forEach((tip) => {
    const item = document.createElement("li");
    appendTextWithLinks(item, tip);
    tipsList.appendChild(item);
  });
}

function renderChat(messages) {
  chatList.innerHTML = "";

  if (!messages.length) {
    const empty = document.createElement("p");
    empty.className = "helper";
    empty.textContent = "No messages yet. Share feeding or exercise details to build memory.";
    chatList.appendChild(empty);
    return;
  }

  messages.forEach((message) => {
    const bubble = document.createElement("div");
    const isUser = message.role === "user";
    bubble.className = `chat-bubble ${isUser ? "chat-user" : "chat-assistant"}`;

    const role = document.createElement("p");
    role.className = "chat-role";
    role.textContent = isUser ? "You" : "Coach";

    const body = document.createElement("p");
    body.className = "chat-body";
    body.textContent = message.content;

    const time = document.createElement("p");
    time.className = "chat-time";
    time.textContent = formatDateTimeLabel(message.created_at);

    bubble.appendChild(role);
    bubble.appendChild(body);
    bubble.appendChild(time);
    chatList.appendChild(bubble);
  });

  chatList.scrollTop = chatList.scrollHeight;
}

function renderMemory(items) {
  memoryList.innerHTML = "";

  if (!items.length) {
    memoryStatus.textContent = "No memory yet.";
    return;
  }

  memoryStatus.textContent = `${items.length} memory item${items.length === 1 ? "" : "s"} saved.`;

  items.forEach((item) => {
    const row = document.createElement("li");
    row.className = "fact-item";
    row.innerHTML = `<strong>${item.memory_key}</strong><span>${item.memory_value}</span>`;
    memoryList.appendChild(row);
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

async function updatePetProfileDatesRemote(petId, payload) {
  const response = await fetch(`/api/pets/${petId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Unable to update pet profile.");
  }

  const data = await response.json();
  return data.pet;
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

async function fetchAdvice() {
  if (!activePetId) {
    return { tips: [] };
  }

  const response = await fetch(`/api/advice?petId=${activePetId}`);
  if (!response.ok) {
    return { tips: [] };
  }

  return response.json();
}

async function refreshAdviceRemote() {
  const response = await fetch("/api/advice/refresh", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      petId: activePetId,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Unable to refresh advice.");
  }

  return response.json();
}

async function fetchChatHistory() {
  if (!activePetId) {
    return [];
  }

  const response = await fetch(`/api/chat/history?petId=${activePetId}`);
  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return data.messages || [];
}

async function fetchMemory() {
  if (!activePetId) {
    return [];
  }

  const response = await fetch(`/api/memory?petId=${activePetId}`);
  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return data.items || [];
}

async function sendChatMessage(message) {
  const response = await fetch("/api/chat/message", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      petId: activePetId,
      message,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Unable to send message.");
  }

  return response.json();
}

function renderPetOptions() {
  const selects = [petSelect, heroPetSelect];
  selects.forEach((select) => {
    select.innerHTML = "";
  });

  petSelect.innerHTML = "";
  if (!pets.length) {
    selects.forEach((select) => {
      const option = document.createElement("option");
      option.textContent = "No pets yet";
      option.value = "";
      select.appendChild(option);
      select.disabled = true;
    });
    return;
  }

  selects.forEach((select) => {
    select.disabled = false;
  });

  pets.forEach((pet) => {
    selects.forEach((select) => {
      const option = document.createElement("option");
      option.value = pet.id;
      option.textContent = pet.name;
      select.appendChild(option);
    });
  });
}

async function refresh() {
  if (!activePetId) {
    updateLatest([]);
    renderEntries([]);
    renderChart([]);
    renderTips([]);
    renderChat([]);
    renderMemory([]);
    return;
  }

  const records = await fetchWeights();
  const activePet = pets.find((item) => item.id === activePetId) || null;
  updateLatest(records);
  renderEntries(records);
  renderChart(records);
  trendFeedback.textContent = computeTrendFeedback(records, activePet);

  const advice = await fetchAdvice();
  renderTips(advice.tips || []);
  if (advice.reason === "no_cache") {
    tipsStatus.textContent = "No advice yet. Click Refresh advice to generate it.";
  } else if (advice.updatedAt) {
    tipsStatus.textContent = `Last refreshed ${formatDateTimeLabel(advice.updatedAt)}.`;
  } else {
    tipsStatus.textContent = "Advice unavailable.";
  }

  const messages = await fetchChatHistory();
  renderChat(messages);

  const memoryItems = await fetchMemory();
  renderMemory(memoryItems);
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
  dateInput.value = today.toISOString().split("T")[0];
  closeModal(weighInModal);
  await refresh();
});

updatePetBirthBtn.addEventListener("click", async () => {
  if (!activePetId) {
    return;
  }

  const birthDate = petBirthEditInput.value;
  if (!birthDate) {
    petBirthStatus.textContent = "Choose a birth date first.";
    return;
  }

  petBirthStatus.textContent = "Updating age...";
  try {
    const updatedPet = await updatePetProfileDatesRemote(activePetId, { birthDate });
    pets = pets.map((pet) => (pet.id === updatedPet.id ? updatedPet : pet));
    setActivePet(activePetId);
    petBirthStatus.textContent = "Birth date updated.";
  } catch (error) {
    petBirthStatus.textContent = error.message;
  }
});

updateDietStartBtn.addEventListener("click", async () => {
  if (!activePetId) {
    return;
  }

  dietStartStatus.textContent = "Updating diet start...";
  try {
    const updatedPet = await updatePetProfileDatesRemote(activePetId, {
      dietStartDate: petDietStartEditInput.value || null,
    });
    pets = pets.map((pet) => (pet.id === updatedPet.id ? updatedPet : pet));
    setActivePet(activePetId);
    await refresh();
    dietStartStatus.textContent = "Diet start date updated.";
  } catch (error) {
    dietStartStatus.textContent = error.message;
  }
});

petSelect.addEventListener("change", async (event) => {
  setActivePet(event.target.value);
  tipsStatus.textContent = activePetId ? "Loading saved advice..." : "Add a pet to load advice.";
  await refresh();
});

heroPetSelect.addEventListener("change", async (event) => {
  setActivePet(event.target.value);
  tipsStatus.textContent = activePetId ? "Loading saved advice..." : "Add a pet to load advice.";
  await refresh();
});

refreshAdviceBtn.addEventListener("click", async () => {
  if (!activePetId) {
    return;
  }

  tipsStatus.textContent = "Refreshing advice...";
  try {
    const data = await refreshAdviceRemote();
    renderTips(data.tips || []);
    if (data.updatedAt) {
      tipsStatus.textContent = `Last refreshed ${formatDateTimeLabel(data.updatedAt)}.`;
    } else if (data.reason === "no_tips") {
      tipsStatus.textContent = "No advice returned. Add more details and try again.";
    } else {
      tipsStatus.textContent = "Advice refreshed.";
    }
  } catch (error) {
    tipsStatus.textContent = error.message;
  }
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!activePetId) {
    return;
  }

  const message = chatInput.value.trim();
  if (!message) {
    return;
  }

  chatStatus.textContent = "Sending...";
  chatInput.value = "";

  try {
    await sendChatMessage(message);
    const [messages, memoryItems] = await Promise.all([fetchChatHistory(), fetchMemory()]);
    renderChat(messages);
    renderMemory(memoryItems);
    chatStatus.textContent = "Saved. Refresh advice when you are ready.";
  } catch (error) {
    chatStatus.textContent = error.message;
  }
});

petForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    name: petNameInput.value.trim(),
    breed: petBreedInput.value.trim(),
    birthDate: petBirthInput.value,
    dietStartDate: petDietStartInput.value || null,
  };

  try {
    const pet = await createPet(payload);
    pets.push(pet);
    renderPetOptions();
    petSelect.value = pet.id;
    setActivePet(pet.id);
    petForm.reset();
    closeModal(petModal);
    await refresh();
  } catch (error) {
    alert("Unable to save the pet. Please try again.");
  }
});

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

showChartViewBtn.addEventListener("click", () => setWeightView("chart"));
showEntriesViewBtn.addEventListener("click", () => setWeightView("entries"));

openPetProfileBtn.addEventListener("click", () => openModal(petModal));
openWeighInBtn.addEventListener("click", () => {
  if (!activePetId) {
    alert("Add a pet before logging weigh-ins.");
    openModal(petModal);
    return;
  }
  openModal(weighInModal);
});

document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", (event) => {
    const modalId = event.currentTarget.getAttribute("data-close-modal");
    closeModal(document.getElementById(modalId));
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }
  closeModal(petModal);
  closeModal(weighInModal);
});

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
    heroPetSelect.value = initialId;
  }

  setActivePet(initialId);
  tipsStatus.textContent = pets.length ? "Loading saved advice..." : "Add a pet to load advice.";
  setWeightView("chart");
  await refresh();
}

boot();
