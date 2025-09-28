// menu.js (v51) — Mantiene tu lógica y añade robustez WebView para firma/iframe.
document.addEventListener("DOMContentLoaded", () => {
  if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
  const auth = firebase.auth();
  const db = firebase.firestore();

  const emailFromId = (id) => `${id}@liderman.com.pe`;
  const sanitizeId = (raw) => raw.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');

  let usuarioSalienteData = null;
  let relevoSignaturePad = null;
  let secondaryApp = null;
  let clientesDataCU = {};

  // Datos de usuario
  auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }
    try {
      const userDetailsP = document.getElementById('user-details');
      const userClientUnitP = document.getElementById('user-client-unit');
      const userId = user.email.split('@')[0];
      const userDoc = await db.collection('USUARIOS').doc(userId).get();
      if (userDoc.exists) {
        usuarioSalienteData = { ...userDoc.data(), id: userId };
        userDetailsP.textContent = `${usuarioSalienteData.NOMBRES} ${usuarioSalienteData.APELLIDOS}`;
        userClientUnitP.textContent = `${usuarioSalienteData.CLIENTE} - ${usuarioSalienteData.UNIDAD} - ${usuarioSalienteData.PUESTO || ''}`;
      } else {
        userDetailsP.textContent = user.email;
      }
    } catch (e) { console.error('Error al obtener datos del usuario:', e); }
  });

  function setupEventListeners() {
    const logoutBtn = document.getElementById('logout-btn'),
          ingresarInfoBtn = document.getElementById('ingresar-info-btn'),
          ingresarInfoModal = document.getElementById('ingresar-info-modal-overlay'),
          ingresarInfoCancelBtn = document.getElementById('ingresar-info-cancel-btn'),
          verInfoBtn = document.getElementById('ver-info-btn'),
          verInfoModal = document.getElementById('ver-info-modal-overlay'),
          verInfoCancelBtn = document.getElementById('ver-info-cancel-btn'),
          relevoBtn = document.getElementById('relevo-btn'),
          relevoModal = document.getElementById('relevo-modal-overlay'),
          relevoCancelBtn = document.getElementById('relevo-cancel-btn'),
          relevoForm = document.getElementById('relevo-form'),
          relevoCanvas = document.getElementById('relevo-firma-canvas'),
          relevoClearFirmaBtn = document.getElementById('relevo-clear-firma'),
          relevoCrearUsuarioBtn = document.getElementById('relevo-crear-usuario-btn'),
          crearUsuarioModal = document.getElementById('crear-usuario-modal'),
          crearUsuarioForm = document.getElementById('crear-usuario-form'),
          crearUsuarioCancelBtn = document.getElementById('cu-cancel'),
          cuClienteInput = document.getElementById('cu-cliente-input'),
          cuClienteList = document.getElementById('cu-cliente-list'),
          cuUnidadInput = document.getElementById('cu-unidad-input'),
          cuUnidadList = document.getElementById('cu-unidad-list'),
          cuPuestoInput = document.getElementById('cu-puesto-input'),
          cuPuestoList = document.getElementById('cu-puesto-list'),
          cuAddClienteBtn = document.getElementById('cu-add-cliente-btn'),
          cuAddUnidadBtn = document.getElementById('cu-add-unidad-btn'),
          cuAddPuestoBtn = document.getElementById('cu-add-puesto-btn'),
          iframeModal = document.getElementById('iframe-modal'),
          iframeTitle = document.getElementById('iframe-title'),
          closeIframeBtn = document.getElementById('close-iframe-modal-btn'),
          iframe = document.getElementById('add-item-iframe');

    const handleLogout = e => { e.preventDefault(); auth.signOut().then(() => window.location.href = 'index.html'); };

    // Ingresar Info
    const openIngresarInfoModal = e => { e.preventDefault(); ingresarInfoModal.style.display = 'flex'; };
    const closeIngresarInfoModal = () => { ingresarInfoModal.style.display = 'none'; };
    const closeIngresarInfoOnBackdrop = e => { if (e.target === ingresarInfoModal) closeIngresarInfoModal(); };

    // Ver Info
    const openVerInfoModal = e => { e.preventDefault(); verInfoModal.style.display = 'flex'; };
    const closeVerInfoModal = () => { verInfoModal.style.display = 'none'; };
    const closeVerInfoOnBackdrop = e => { if (e.target === verInfoModal) closeVerInfoModal(); };

    // Relevo
    const resizeRelevoCanvas = () => {
      if (!relevoCanvas) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const { width } = relevoCanvas.getBoundingClientRect();
      const height = parseFloat(getComputedStyle(relevoCanvas).height);
      relevoCanvas.width = Math.floor(width * ratio);
      relevoCanvas.height = Math.floor(height * ratio);
      relevoCanvas.getContext('2d').scale(ratio, ratio);
      if (relevoSignaturePad) relevoSignaturePad.clear();
    };
    const openRelevoModal = e => {
      e.preventDefault();
      relevoModal.style.display = 'flex';
      if (!relevoSignaturePad) {
        relevoSignaturePad = new SignaturePad(relevoCanvas, { backgroundColor: 'rgb(255,255,255)' });
        relevoCanvas._signaturePadInstance = relevoSignaturePad;
      }
      resizeRelevoCanvas();
    };
    const closeRelevoModal = () => { relevoForm.reset(); if (relevoSignaturePad) relevoSignaturePad.clear(); relevoModal.style.display = 'none'; };
    const clearRelevoSignature = () => { if (relevoSignaturePad) relevoSignaturePad.clear(); };

    const handleRelevoSubmit = async (e) => {
      e.preventDefault();
      const idEntranteRaw = document.getElementById('relevo-id').value,
            idEntrante = sanitizeId(idEntranteRaw),
            passEntrante = document.getElementById('relevo-password').value,
            comentario = document.getElementById('relevo-comentario').value;
      if (!idEntrante || !passEntrante || !comentario || relevoSignaturePad.isEmpty()) {
        UI.alert('Campos incompletos', 'Completa todos los campos, incluida la firma.'); return;
      }
      UI.showOverlay('Procesando relevo…');
      try {
        const docEntrante = await db.collection('USUARIOS').doc(idEntrante).get();
        if (!docEntrante.exists) throw new Error('El ID del usuario entrante no existe.');
        const userIn = docEntrante.data();
        if (userIn.CLIENTE !== usuarioSalienteData.CLIENTE || userIn.UNIDAD !== usuarioSalienteData.UNIDAD || userIn.PUESTO !== usuarioSalienteData.PUESTO) {
          throw new Error('El usuario entrante no pertenece al mismo cliente, unidad y puesto.');
        }
        if (userIn.ESTADO !== 'ACTIVO') { throw new Error(`El usuario entrante se encuentra ${userIn.ESTADO}. No se puede realizar el relevo.`); }
        const firmaURL = relevoSignaturePad.toDataURL('image/png');
        await db.collection('CUADERNO').add({
          tipoRegistro: 'RELEVO',
          cliente: usuarioSalienteData.CLIENTE,
          unidad:  usuarioSalienteData.UNIDAD,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          comentario, // no mostramos firma en listados
          usuarioSaliente: { id: usuarioSalienteData.id, nombre: `${usuarioSalienteData.NOMBRES} ${usuarioSalienteData.APELLIDOS}` },
          usuarioEntrante: { id: idEntrante, nombre: `${userIn.NOMBRES} ${userIn.APELLIDOS}` }
        });
        // Validación de credenciales del entrante
        const secAuth = getSecondaryAuth();
        await secAuth.signInWithEmailAndPassword(emailFromId(idEntrante), passEntrante);
        await secAuth.signOut();
        UI.hideOverlay();
        UI.alert('Éxito', 'Relevo completado correctamente. La sesión ha sido actualizada.', () => location.reload());
      } catch (err) {
        console.error('Error en relevo:', err);
        UI.hideOverlay();
        const msg = (err?.code && ['auth/wrong-password','auth/user-not-found','auth/invalid-credential'].includes(err.code))
          ? 'Credenciales del usuario entrante incorrectas.' : (err.message || 'Ocurrió un error.');
        UI.alert('Error en Relevo', msg);
      }
    };

    // Secundario para alta/validación
    const getSecondaryAuth = () => {
      if (!secondaryApp) {
        secondaryApp = firebase.apps.find(a => a.name === 'secondary') || firebase.initializeApp(firebaseConfig, 'secondary');
      }
      return secondaryApp.auth();
    };

    // Iframe Add flows
    const openIframeModal = (url, title) => { iframe.src = url; iframeTitle.textContent = title; iframeModal.style.display = 'flex'; };
    const closeIframeModal = () => { iframeModal.style.display = 'none'; iframe.src = 'about:blank'; };

    // Catálogos CU (para creación rápida)
    const cargarDatosCU = async (clientePreseleccionado, unidadPreseleccionada) => {
      UI.showOverlay('Cargando datos...');
      try {
        const ss = await db.collection('CLIENTE_UNIDAD').get();
        clientesDataCU = {};
        ss.docs.forEach(doc => { clientesDataCU[doc.id] = doc.data().unidades || {}; });

        const clientesNombres = Object.keys(clientesDataCU).sort();
        UI.createSearchableDropdown(cuClienteInput, cuClienteList, clientesNombres, (clienteSel) => {
          cuUnidadInput.disabled = false; cuUnidadInput.value = ''; cuPuestoInput.disabled = true; cuPuestoInput.value = '';
          const unidades = clientesDataCU[clienteSel] ? Object.keys(clientesDataCU[clienteSel]).sort() : [];
          UI.createSearchableDropdown(cuUnidadInput, cuUnidadList, unidades, (unidadSel) => {
            cuPuestoInput.disabled = false; cuPuestoInput.value = '';
            const puestos = (clientesDataCU[clienteSel] && clientesDataCU[clienteSel][unidadSel]) ? [...clientesDataCU[clienteSel][unidadSel]].sort() : [];
            UI.createSearchableDropdown(cuPuestoInput, cuPuestoList, puestos);
          });
        });

        if (clientePreseleccionado) {
          cuClienteInput.value = clientePreseleccionado; cuUnidadInput.disabled = false;
          const unidades = clientesDataCU[clientePreseleccionado] ? Object.keys(clientesDataCU[clientePreseleccionado]).sort() : [];
          UI.createSearchableDropdown(cuUnidadInput, cuUnidadList, unidades, (unidadSel) => {
            cuPuestoInput.disabled = false; cuPuestoInput.value = '';
            const puestos = (clientesDataCU[clientePreseleccionado] && clientesDataCU[clientePreseleccionado][unidadSel]) ? [...clientesDataCU[clientePreseleccionado][unidadSel]].sort() : [];
            UI.createSearchableDropdown(cuPuestoInput, cuPuestoList, puestos);
          });
          if (unidadPreseleccionada) {
            cuUnidadInput.value = unidadPreseleccionada; cuPuestoInput.disabled = false;
            const puestos = (clientesDataCU[clientePreseleccionado] && clientesDataCU[clientePreseleccionado][unidadPreseleccionada]) ? [...clientesDataCU[clientePreseleccionado][unidadPreseleccionada]].sort() : [];
            UI.createSearchableDropdown(cuPuestoInput, cuPuestoList, puestos);
          }
        }
      } catch(e) {
        console.error(e); UI.alert("Error", "No se pudieron cargar los datos de clientes.");
      } finally { UI.hideOverlay(); }
    };

    // Mensajes desde iframes (alta rápida)
    const handleIframeMessage = (event) => {
      const ORIGIN_ALLOWLIST = [location.origin];
      if (!ORIGIN_ALLOWLIST.includes(event.origin) || event.source !== iframe.contentWindow) return;
      const data = event.data;
      if (data?.type === 'unidadAgregada') { cargarDatosCU(data.cliente); }
      else if (data?.type === 'puestoAgregado') { cargarDatosCU(data.cliente, data.unidad); }
      else if (data === 'clienteAgregado') { cargarDatosCU(); }
    };
    window.removeEventListener('message', handleIframeMessage);
    window.addEventListener('message', handleIframeMessage);

    // Crear usuario rápido
    const handleCrearUsuarioSubmit = async (e) => {
      e.preventDefault();
      const id = sanitizeId(document.getElementById('cu-id').value),
            nom = document.getElementById('cu-nombres').value.trim(),
            ape = document.getElementById('cu-apellidos').value.trim(),
            cli = cuClienteInput.value.trim(),
            uni = cuUnidadInput.value.trim(),
            psto = cuPuestoInput.value.trim(),
            p1 = document.getElementById('cu-pass').value,
            p2 = document.getElementById('cu-pass2').value;
      if (!id || !nom || !ape || !cli || !uni || !psto || !p1 || !p2) { UI.alert('Aviso', 'Complete todos los campos.'); return; }
      if (p1 !== p2) { UI.alert('Aviso', 'Las contraseñas no coinciden.'); return; }
      UI.showOverlay('Creando usuario…');
      try {
        const secAuth = getSecondaryAuth();
        await secAuth.createUserWithEmailAndPassword(emailFromId(id), p1);
        await db.collection('USUARIOS').doc(id).set({
          NOMBRES: nom.toUpperCase(), APELLIDOS: ape.toUpperCase(), CLIENTE: cli.toUpperCase(),
          UNIDAD: uni.toUpperCase(), PUESTO: psto.toUpperCase(), TIPO: 'AGENTE', ESTADO: 'INACTIVO'
        }, { merge: true });
        await secAuth.signOut();
        UI.hideOverlay();
        document.getElementById('relevo-id').value = id;
        UI.alert('Usuario creado', 'Ahora ingresa su contraseña para completar el relevo.', () => crearUsuarioModal.style.display='none');
      } catch (err) {
        UI.hideOverlay();
        const msg = (err?.code === 'auth/email-already-in-use') ? 'Ese ID ya está registrado.'
                  : (err?.code === 'auth/weak-password') ? 'La contraseña debe tener al menos 6 caracteres.'
                  : 'Ocurrió un error.';
        UI.alert('Error', msg);
      }
    };

    // Bindings
    const handleLogoutBind = (e)=>handleLogout(e);
    logoutBtn.removeEventListener('click', handleLogoutBind); logoutBtn.addEventListener('click', handleLogoutBind);

    const openIngresarBind = (e)=>openIngresarInfoModal(e);
    ingresarInfoBtn.removeEventListener('click', openIngresarBind); ingresarInfoBtn.addEventListener('click', openIngresarBind);
    const closeIngresarBind = ()=>closeIngresarInfoModal();
    ingresarInfoCancelBtn.removeEventListener('click', closeIngresarBind); ingresarInfoCancelBtn.addEventListener('click', closeIngresarBind);
    ingresarInfoModal.removeEventListener('click', closeIngresarInfoOnBackdrop); ingresarInfoModal.addEventListener('click', closeIngresarInfoOnBackdrop);

    const openVerBind = (e)=>openVerInfoModal(e);
    verInfoBtn.removeEventListener('click', openVerBind); verInfoBtn.addEventListener('click', openVerBind);
    const closeVerBind = ()=>closeVerInfoModal();
    verInfoCancelBtn.removeEventListener('click', closeVerBind); verInfoCancelBtn.addEventListener('click', closeVerBind);
    verInfoModal.removeEventListener('click', closeVerInfoOnBackdrop); verInfoModal.addEventListener('click', closeVerInfoOnBackdrop);

    const openRelevoBind = (e)=>openRelevoModal(e);
    relevoBtn.removeEventListener('click', openRelevoBind); relevoBtn.addEventListener('click', openRelevoBind);
    const closeRelevoBind = ()=>closeRelevoModal();
    relevoCancelBtn.removeEventListener('click', closeRelevoBind); relevoCancelBtn.addEventListener('click', closeRelevoBind);

    const clearFirmaBind = ()=>clearRelevoSignature();
    relevoClearFirmaBtn.removeEventListener('click', clearFirmaBind); relevoClearFirmaBtn.addEventListener('click', clearFirmaBind);

    relevoForm.removeEventListener('submit', handleRelevoSubmit); relevoForm.addEventListener('submit', handleRelevoSubmit);

    const openCrearUsuarioBind = ()=>{ crearUsuarioModal.style.display = 'flex'; cargarDatosCU(); };
    relevoCrearUsuarioBtn.removeEventListener('click', openCrearUsuarioBind); relevoCrearUsuarioBtn.addEventListener('click', openCrearUsuarioBind);

    const crearUsuarioCancelBind = ()=>{ crearUsuarioForm.reset(); document.getElementById('cu-unidad-input').disabled = true; document.getElementById('cu-puesto-input').disabled = true; crearUsuarioModal.style.display='none'; };
    crearUsuarioCancelBtn.removeEventListener('click', crearUsuarioCancelBind); crearUsuarioCancelBtn.addEventListener('click', crearUsuarioCancelBind);

    crearUsuarioModal.removeEventListener('click', (e)=>{ if (e.target === crearUsuarioModal) crearUsuarioCancelBind(); });
    crearUsuarioModal.addEventListener('click', (e)=>{ if (e.target === crearUsuarioModal) crearUsuarioCancelBind(); });

    const handleAddUnidad = () => {
      const cliente = cuClienteInput.value.trim().toUpperCase();
      if (!cliente) { UI.alert("Aviso", "Primero debe seleccionar un cliente."); return; }
      openIframeModal(`add_unidad.html?cliente=${encodeURIComponent(cliente)}`, 'Añadir Nueva Unidad');
    };
    const handleAddPuesto = () => {
      const cliente = cuClienteInput.value.trim().toUpperCase();
      const unidad = cuUnidadInput.value.trim().toUpperCase();
      if (!cliente || !unidad) { UI.alert("Aviso", "Primero debe seleccionar un cliente y una unidad."); return; }
      openIframeModal(`add_puesto.html?cliente=${encodeURIComponent(cliente)}&unidad=${encodeURIComponent(unidad)}`, 'Añadir Nuevo Puesto');
    };
    cuAddClienteBtn.removeEventListener('click', ()=>openIframeModal('add_cliente_unidad.html', 'Añadir Cliente, Unidad y Puesto'));
    cuAddClienteBtn.addEventListener('click', ()=>openIframeModal('add_cliente_unidad.html', 'Añadir Cliente, Unidad y Puesto'));
    cuAddUnidadBtn?.removeEventListener('click', handleAddUnidad); cuAddUnidadBtn?.addEventListener('click', handleAddUnidad);
    cuAddPuestoBtn?.removeEventListener('click', handleAddPuesto); cuAddPuestoBtn?.addEventListener('click', handleAddPuesto);

    if (closeIframeBtn) { closeIframeBtn.removeEventListener('click', closeIframeModal); closeIframeBtn.addEventListener('click', closeIframeModal); }

    // Iframe resize helper
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'resize-iframe' && typeof event.data.height === 'number') {
        if (iframe) iframe.style.minHeight = `${event.data.height}px`;
      }
    }, { passive: true });
  }

  setupEventListeners();
  window.addEventListener('pageshow', (event) => { if (event.persisted) { setupEventListeners(); } });
});
