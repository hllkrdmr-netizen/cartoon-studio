import './index.css';

const root = document.getElementById('app');
if (!root) {
  throw new Error('#app root element missing from index.html');
}

root.innerHTML = `
  <main class="flex h-screen items-center justify-center bg-neutral-950 text-neutral-100">
    <div class="text-center">
      <h1 class="text-3xl font-semibold">Agent Park</h1>
      <p class="mt-2 text-sm text-neutral-400">Editor scaffolding — IPC bridge: <span id="ping">…</span></p>
    </div>
  </main>
`;

const pingEl = document.getElementById('ping');
window.api.ping().then((reply) => {
  if (pingEl) pingEl.textContent = reply;
});
