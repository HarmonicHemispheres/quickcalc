/* ============================================================
   THEME
   ============================================================ */
const themePicker = document.getElementById('theme-picker');
function setTheme(theme) {
  settings.theme = theme;
  document.documentElement.dataset.theme = theme;
  themePicker.querySelectorAll('button').forEach(b => {
    b.setAttribute('aria-selected', b.dataset.theme === theme);
  });
  persistSettings();
}
themePicker.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-theme]');
  if (b) setTheme(b.dataset.theme);
});
setTheme(settings.theme);
