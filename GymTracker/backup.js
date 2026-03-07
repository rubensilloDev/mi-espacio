/**
 * ============================================================
 * js/backup.js — Exportar e Importar datos
 * ============================================================
 * Exportar: Descarga un JSON con rutinas + entrenamientos.
 * Importar: Lee el JSON y escribe en Firestore usando batch.
 * ============================================================
 */

'use strict';

const BackupModule = (() => {

  document.addEventListener('section:enter', async e => {
    if (e.detail.section === 'backup' && auth.currentUser) {
      await updateBackupStats();
    }
  });

  // ════════════════════════════════════════════════════════════
  // ESTADÍSTICAS DEL BACKUP
  // ════════════════════════════════════════════════════════════

  /** Actualiza los contadores de rutinas / entrenamientos / ejercicios */
  async function updateBackupStats() {
    try {
      const [routines, workouts] = await Promise.all([
        getRoutines(),
        getAllWorkouts()
      ]);

      const totalExercises = routines.reduce((sum, r) => sum + (r.exercises?.length || 0), 0);
      const lastBackup     = localStorage.getItem('gymtracker-last-backup');

      // Actualizar DOM
      const items = document.querySelectorAll('.backup-info-item');
      if (items[0]) items[0].innerHTML = `<i class="ph-fill ph-lightning"></i> ${routines.length} rutinas`;
      if (items[1]) items[1].innerHTML = `<i class="ph-fill ph-calendar-check"></i> ${workouts.length} entrenamientos`;
      if (items[2]) items[2].innerHTML = `<i class="ph-fill ph-barbell"></i> ${totalExercises} ejercicios`;

      const lastEl = document.querySelector('.backup-card__last');
      if (lastEl) {
        lastEl.innerHTML = lastBackup
          ? `Último backup: <strong>${new Date(lastBackup).toLocaleString('es-ES', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</strong>`
          : 'Aún no has hecho ningún backup.';
      }
    } catch (err) {
      console.error('Error cargando stats del backup:', err);
    }
  }

  // ════════════════════════════════════════════════════════════
  // EXPORTAR
  // ════════════════════════════════════════════════════════════

  document.getElementById('btn-export')?.addEventListener('click', exportData);

  async function exportData() {
    const btn = document.getElementById('btn-export');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner"></i> Exportando…'; }

    try {
      const [routines, workouts] = await Promise.all([
        getRoutines(),
        getAllWorkouts()
      ]);

      const backup = {
        version:    '1.0.0',
        app:        'GymTracker Pro',
        exportDate: new Date().toISOString(),
        user:       auth.currentUser?.email || '',
        stats: {
          routines:  routines.length,
          workouts:  workouts.length,
          exercises: routines.reduce((s, r) => s + (r.exercises?.length || 0), 0)
        },
        routines:  routines.map(r => { const { id, ...rest } = r; return rest; }),
        workouts:  workouts.map(w => { const { id, ...rest } = w; return rest; })
      };

      // Crear y descargar el archivo JSON
      const json      = JSON.stringify(backup, null, 2);
      const blob      = new Blob([json], { type: 'application/json' });
      const url       = URL.createObjectURL(blob);
      const today     = new Date().toISOString().split('T')[0];
      const link      = document.createElement('a');
      link.href     = url;
      link.download = `gymtracker-backup-${today}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Guardar fecha del último backup
      localStorage.setItem('gymtracker-last-backup', new Date().toISOString());
      showToast('Backup descargado correctamente ✓', 'success');
      await updateBackupStats();

    } catch (err) {
      console.error('Error exportando:', err);
      showToast('Error al exportar los datos', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph ph-download-simple"></i> Descargar gymtracker-backup.json'; }
    }
  }

  // ════════════════════════════════════════════════════════════
  // IMPORTAR — Drag & Drop + Selector de archivo
  // ════════════════════════════════════════════════════════════

  const dropZone   = document.getElementById('file-drop-zone');
  const fileInput  = document.getElementById('input-restore-file');
  const btnRestore = document.getElementById('btn-restore');

  let _pendingImportData = null;

  dropZone?.addEventListener('click', () => fileInput?.click());

  dropZone?.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('file-drop-zone--active');
  });

  dropZone?.addEventListener('dragleave', () => {
    dropZone.classList.remove('file-drop-zone--active');
  });

  dropZone?.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('file-drop-zone--active');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  });

  fileInput?.addEventListener('change', e => {
    if (e.target.files[0]) processFile(e.target.files[0]);
  });

  /**
   * Lee el archivo JSON seleccionado y muestra una previsualización.
   * @param {File} file
   */
  function processFile(file) {
    if (!file.name.toLowerCase().endsWith('.json')) {
      showToast('Solo se aceptan archivos .json', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);

        // Validar que tiene la estructura esperada
        if (!data.routines && !data.workouts) {
          showToast('El archivo no tiene el formato correcto de GymTracker', 'error');
          return;
        }

        _pendingImportData = data;

        // Actualizar la UI con la previsualización del archivo
        const dropText = dropZone?.querySelector('.file-drop-zone__text');
        if (dropText) {
          dropText.innerHTML = `
            <strong style="color:var(--accent)">${file.name}</strong><br/>
            <span>${(file.size / 1024).toFixed(1)} KB · 
              ${data.routines?.length || 0} rutinas, 
              ${data.workouts?.length || 0} entrenamientos</span>`;
        }

        if (btnRestore) btnRestore.disabled = false;
        showToast('Archivo cargado. Pulsa "Restaurar" para continuar.', 'success');

      } catch (err) {
        showToast('Error al leer el archivo JSON', 'error');
        console.error('Error parseando JSON:', err);
      }
    };
    reader.readAsText(file);
  }

  // ── Botón restaurar ───────────────────────────────────────

  btnRestore?.addEventListener('click', async () => {
    if (!_pendingImportData) return;

    const ok = await showConfirm(
      '¿Restaurar datos?',
      `Se añadirán ${_pendingImportData.routines?.length || 0} rutinas y ${_pendingImportData.workouts?.length || 0} entrenamientos a tu cuenta. Los datos existentes NO se borrarán.`
    );
    if (!ok) return;

    if (btnRestore) { btnRestore.disabled = true; btnRestore.innerHTML = '<i class="ph ph-spinner"></i> Restaurando…'; }

    try {
      await importBackup(_pendingImportData);
      showToast('Datos restaurados correctamente ✓', 'success');
      _pendingImportData = null;
      if (btnRestore) btnRestore.disabled = true;

      // Resetear zona de drop
      const dropText = dropZone?.querySelector('.file-drop-zone__text');
      if (dropText) {
        dropText.innerHTML = `Arrastra tu archivo .json aquí<br/><span>o haz clic para seleccionarlo</span>`;
      }

      await updateBackupStats();

    } catch (err) {
      console.error('Error importando:', err);
      showToast('Error al restaurar los datos', 'error');
    } finally {
      if (btnRestore) { btnRestore.disabled = false; btnRestore.innerHTML = '<i class="ph ph-upload-simple"></i> Restaurar datos'; }
    }
  });

  return { init: updateBackupStats };

})();
