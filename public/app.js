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
const tipsDebug = document.getElementById("tipsDebug");
const tipsDebugContent = document.getElementById("tipsDebugContent");

let chart;
let pets = [];
let activePetId = null;

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
    return;
  }
  petDetails.textContent = `${pet.breed} · ${formatAge(pet.birth_date)}`;
  activePetLabel.textContent = `Logging for ${pet.name}`;
  form.querySelector("button").disabled = false;
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
    item.textContent = tip;
    tipsList.appendChild(item);
  });
}

function renderTipsDebug(debugInfo) {
  if (!tipsDebug || !tipsDebugContent) {
    return;
  }
  if (!debugInfo) {
    tipsDebugContent.textContent = "";
    tipsDebug.open = false;
    tipsDebug.style.display = "none";
    return;
  }
  tipsDebug.style.display = "block";
  tipsDebugContent.textContent = JSON.stringify(debugInfo, null, 2);
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

async function fetchTips() {
  if (!activePetId) {
    return [];
  }
  const response = await fetch(`/api/tips?petId=${activePetId}`);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    tipsStatus.textContent = data?.error || "Tips unavailable. Check API key.";
    return { tips: null, debug: data?.debug || null };
  }
  const data = await response.json();
  if (data.reason === "no_weights") {
    tipsStatus.textContent = "Add a few weigh-ins to generate tips.";
  } else if (data.reason === "no_tips") {
    tipsStatus.textContent = "No tips returned. Try again.";
  }
  return { tips: data.tips || [], debug: data.debug || null };
}

async function refresh() {
  if (!activePetId) {
    updateLatest([]);
    renderEntries([]);
    renderChart([]);
    renderTips(null);
    return;
  }
  const records = await fetchWeights();
  updateLatest(records);
  renderEntries(records);
  renderChart(records);
  const tipsPayload = await fetchTips();
  renderTips(tipsPayload?.tips ?? null);
  renderTipsDebug(tipsPayload?.debug ?? null);
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

async function boot() {
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
