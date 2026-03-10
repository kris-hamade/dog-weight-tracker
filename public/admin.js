const adminName = document.getElementById("adminName");
const logoutBtn = document.getElementById("adminLogoutBtn");
const form = document.getElementById("createUserForm");
const usernameInput = document.getElementById("newUsernameInput");
const passwordInput = document.getElementById("newPasswordInput");
const isAdminInput = document.getElementById("newIsAdmin");
const status = document.getElementById("createStatus");

async function fetchMe() {
  const response = await fetch("/api/me");
  if (response.status === 401) {
    window.location.href = "/login";
    return null;
  }
  if (!response.ok) {
    throw new Error("Unable to load user.");
  }
  const data = await response.json();
  return data.user;
}

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/login";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "Creating user...";

  const response = await fetch("/api/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: usernameInput.value.trim(),
      password: passwordInput.value,
      isAdmin: isAdminInput.checked,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    status.textContent = data?.error || "Unable to create user.";
    return;
  }

  status.textContent = "User created.";
  form.reset();
});

async function boot() {
  try {
    const user = await fetchMe();
    if (!user) {
      return;
    }
    adminName.textContent = user.username;
  } catch (error) {
    adminName.textContent = "Unknown";
  }
}

boot();
