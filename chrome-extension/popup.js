document.getElementById("save").addEventListener("click", async () => {
  const token = document.getElementById("token").value.trim();
  const status = document.getElementById("status");
  if (!token) {
    status.className = "status error";
    status.textContent = "Veuillez coller votre token d'extension.";
    return;
  }
  await chrome.storage.sync.set({ skalleToken: token });
  status.className = "status success";
  status.textContent = "Token enregistré !";
});

chrome.storage.sync.get(["skalleToken"]).then(({ skalleToken }) => {
  if (skalleToken) {
    document.getElementById("token").value = skalleToken;
  }
});

document.getElementById("openDashboard").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "http://localhost:3000/dashboard/social-prospector" });
});
