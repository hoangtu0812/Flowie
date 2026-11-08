const invoke = window.__TAURI__.core.invoke;
const el = (id) => document.getElementById(id);

// An example rather than an empty box. The shape is nested and the field
// names are the file's own, so someone setting up a machine for the
// first time does not have to guess either.
const EXAMPLE = {
  endpoint: "https://flowie.example.com/mcp/",
  credential_account: "flowie.example.com",
  provider: "claude",
  repositories: [
    {
      project_id: "cproject...",
      repository_url: "https://github.com/owner/repo",
      base_branch: "main",
      path: "C:\\code\\repo",
      approved_tests: [["pnpm", "test"]],
      may_publish: false,
    },
  ],
  poll_seconds: 10,
  paused: false,
};

// The textarea is only refreshed while nobody is typing in it, so the
// one-second poll never throws away a half-written configuration.
let editing = false;
el("configuration").addEventListener("focus", () => (editing = true));
el("configuration").addEventListener("blur", () => (editing = false));

function show(target, message, ok) {
  const node = el(target);
  node.textContent = message;
  node.className = message ? (ok ? "good" : "bad") : "";
}

async function refresh() {
  let view;
  try {
    view = await invoke("load_setup");
  } catch (error) {
    show("problem", String(error), false);
    return;
  }
  el("state").textContent = view.state;
  el("state").className = "state " + (view.needsPerson ? "bad" : "");
  el("activity").textContent = view.activity
    ? "đang làm " + view.activity
    : "";
  show("problem", view.problem || "", false);
  el("path").textContent = view.path;
  el("token-state").textContent = view.hasToken
    ? "đã có token"
    : "chưa có token";

  if (!editing) {
    el("configuration").value =
      view.configuration || JSON.stringify(EXAMPLE, null, 2);
  }
}

el("save").addEventListener("click", async () => {
  try {
    await invoke("save_setup", {
      configuration: el("configuration").value,
    });
    show("save-result", "Đã lưu.", true);
  } catch (error) {
    show("save-result", String(error), false);
  }
  refresh();
});

el("reload").addEventListener("click", () => {
  editing = false;
  el("configuration").blur();
  show("save-result", "", true);
  refresh();
});

el("save-token").addEventListener("click", async () => {
  const token = el("token").value;
  if (!token.trim()) {
    show("token-result", "Chưa nhập token.", false);
    return;
  }
  try {
    await invoke("save_token", { token });
    // Cleared as soon as it is stored: a token left in a field is a
    // token in the next screenshot.
    el("token").value = "";
    show("token-result", "Đã lưu token.", true);
  } catch (error) {
    show("token-result", String(error), false);
  }
  refresh();
});

el("forget-token").addEventListener("click", async () => {
  try {
    await invoke("forget_token");
    show("token-result", "Đã xoá token.", true);
  } catch (error) {
    show("token-result", String(error), false);
  }
  refresh();
});

refresh();
setInterval(refresh, 1000);
