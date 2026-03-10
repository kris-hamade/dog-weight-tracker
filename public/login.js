const form = document.getElementById("loginForm");
const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");
const status = document.getElementById("loginStatus");

async function checkSession() {
  const response = await fetch("/api/me");
  if (response.ok) {
    window.location.href = "/";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "Signing in...";

  const response = await fetch("/api/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: usernameInput.value.trim(),
      password: passwordInput.value,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    status.textContent = data?.error || "Sign in failed.";
    return;
  }

  window.location.href = "/";
});

checkSession();
