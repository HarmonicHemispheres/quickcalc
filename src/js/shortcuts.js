/* ============================================================
   KEYBOARD SHORTCUTS — Esc closes overlays; ⌘/Ctrl+K, ',', '/'
   ============================================================ */
document.addEventListener('keydown', (e) => {
  // Always-on Esc
  if (e.key === 'Escape') {
    if (settingsModal.classList.contains('open')) closeSettingsModal();
    if (logsModal.classList.contains('open')) closeLogsModal();
    promptPicker.classList.remove('open');
    tagPopover.classList.remove('open');
    newDropdown.classList.remove('open');
    return;
  }
  if (!settings.shortcuts) return;
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;
  if (e.key === 'k' || e.key === 'K') { e.preventDefault(); createEntry('calc'); }
  else if (e.key === ',')              { e.preventDefault(); openSettings(); }
  else if (e.key === '/')              { e.preventDefault(); promptPickerBtn.click(); }
});
