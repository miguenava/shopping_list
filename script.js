// ================= EVITAR DOBLE CARGA =================
if (typeof window.supabaseApp === 'undefined') {
  window.supabaseApp = true;

  // ================= CONFIGURACIÓN SUPABASE =================
  const SUPABASE_URL = 'https://xadbmzxmfwmymjjxgmxw.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_WDb0u3AcYAeax-GqHpQJ6w_L45oaaqW';
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  console.log('🔌 Conectando a:', SUPABASE_URL);

  // Prueba de conexión
  supabase.from('lists').select('count').then(({ error, data }) => {
    if (error) {
      console.error('❌ Error de conexión:', error);
    } else {
      console.log('✅ Conexión exitosa con Supabase', data);
    }
  });

  // Estado global de la app
  let currentListId = null;
  let currentListCode = null;
  let realtimeChannel = null;

  // Elementos del DOM
  const joinScreen = document.getElementById('joinScreen');
  const listScreen = document.getElementById('listScreen');
  const joinCodeInput = document.getElementById('joinCodeInput');
  const joinBtn = document.getElementById('joinBtn');
  const createListBtn = document.getElementById('createListBtn');
  const exitBtn = document.getElementById('exitBtn');
  const newItemName = document.getElementById('newItemName');
  const addItemBtn = document.getElementById('addItemBtn');
  const itemsList = document.getElementById('itemsList');
  const displayCodeSpan = document.getElementById('displayCode');
  const shareCodeSpan = document.getElementById('shareCode');
  const copyLinkBtn = document.getElementById('copyLinkBtn');
  const statusMsg = document.getElementById('statusMsg');

  function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  function setStatus(text, isError = false) {
    if (!statusMsg) return;
    statusMsg.innerText = text;
    statusMsg.style.color = isError ? '#ef4444' : '#10b981';
    setTimeout(() => {
      if (statusMsg && statusMsg.innerText === text) {
        statusMsg.style.color = '#6b7280';
        if (!isError) statusMsg.innerText = '✅ Todos ven los cambios al instante';
      }
    }, 3000);
  }

  async function renderItems() {
    if (!currentListId) return;
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .eq('list_id', currentListId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error(error);
      setStatus('Error cargando items', true);
      return;
    }

    if (!data || data.length === 0) {
      if (itemsList) itemsList.innerHTML = '<li style="text-align: center; color: #9ca3af;">✨ Añade tus primeros productos ✨</li>';
      return;
    }

    if (!itemsList) return;
    itemsList.innerHTML = '';
    data.forEach(item => {
      const li = document.createElement('li');
      li.className = 'item';
      if (item.checked) li.classList.add('checked');

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = item.checked;
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        updateItemChecked(item.id, cb.checked);
      });

      const span = document.createElement('span');
      span.className = 'item-name';
      span.innerText = item.name;

      li.appendChild(cb);
      li.appendChild(span);
      itemsList.appendChild(li);
    });
  }

  async function updateItemChecked(itemId, checkedStatus) {
    if (!currentListId) return;
    const { error } = await supabase
      .from('items')
      .update({ checked: checkedStatus })
      .eq('id', itemId);
    if (error) console.error(error);
  }

  async function addItem() {
    if (!newItemName) return;
    const name = newItemName.value.trim();
    if (!name) return;
    if (!currentListId) {
      setStatus('No hay lista activa', true);
      return;
    }

    const { error } = await supabase
      .from('items')
      .insert([{ list_id: currentListId, name: name, created_by: 'anonymous' }]);
    if (error) {
      setStatus('Error al añadir', true);
      console.error(error);
    } else {
      newItemName.value = '';
      newItemName.focus();
      setStatus(`➕ "${name}" añadido`);
    }
  }

  function subscribeToItems(listId) {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
    }
    realtimeChannel = supabase
      .channel('items-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'items',
        filter: `list_id=eq.${listId}`
      }, payload => {
        renderItems();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setStatus('📡 Tiempo real activo');
      });
  }

  async function loadListByCode(code) {
    console.log('🔍 Buscando lista con código:', code);
    const { data, error } = await supabase
      .from('lists')
      .select('id, code')
      .eq('code', code)
      .maybeSingle();

    if (error || !data) {
      console.error('❌ Lista no encontrada:', error);
      setStatus(`Código ${code} no encontrado`, true);
      return false;
    }

    console.log('✅ Lista encontrada:', data);
    currentListId = data.id;
    currentListCode = data.code;
    if (displayCodeSpan) displayCodeSpan.innerText = currentListCode;
    if (shareCodeSpan) shareCodeSpan.innerText = currentListCode;

    await renderItems();
    subscribeToItems(currentListId);

    if (joinScreen && listScreen) {
      joinScreen.classList.add('hidden');
      listScreen.classList.remove('hidden');
    }
    return true;
  }

  async function createNewList() {
    console.log('🟢 Creando nueva lista...');
    let newCode = generateCode();
    console.log('📝 Código generado:', newCode);
    
    let exists = true;
    let attempts = 0;
    while (exists && attempts < 5) {
      const { data } = await supabase.from('lists').select('id').eq('code', newCode).maybeSingle();
      if (!data) exists = false;
      else {
        newCode = generateCode();
        attempts++;
      }
    }

    console.log('💾 Insertando lista en Supabase...');
    const { data, error } = await supabase
      .from('lists')
      .insert([{ code: newCode }])
      .select()
      .single();

    if (error) {
      console.error('❌ Error al crear lista:', error);
      setStatus('Error al crear lista', true);
      return;
    }

    console.log('✅ Lista creada:', data);
    currentListId = data.id;
    currentListCode = data.code;
    if (displayCodeSpan) displayCodeSpan.innerText = currentListCode;
    if (shareCodeSpan) shareCodeSpan.innerText = currentListCode;

    await renderItems();
    subscribeToItems(currentListId);

    if (joinScreen && listScreen) {
      joinScreen.classList.add('hidden');
      listScreen.classList.remove('hidden');
    }
    setStatus(`🎉 Lista creada! Código: ${currentListCode}`);
  }

  function exitList() {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    currentListId = null;
    currentListCode = null;
    if (joinScreen && listScreen) {
      joinScreen.classList.remove('hidden');
      listScreen.classList.add('hidden');
    }
    if (joinCodeInput) joinCodeInput.value = '';
    if (itemsList) itemsList.innerHTML = '<li style="text-align: center; color: #9ca3af;">Cargando productos...</li>';
    setStatus('Has salido de la lista', false);
  }

  function copyShareLink() {
    if (!currentListCode) return;
    const url = `${window.location.origin}${window.location.pathname}?code=${currentListCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setStatus('🔗 Enlace copiado al portapapeles');
    }).catch(() => {
      setStatus('No se pudo copiar', true);
    });
  }

  async function joinWithCode() {
    if (!joinCodeInput) return;
    let code = joinCodeInput.value.trim();
    if (code.length !== 6 || isNaN(code)) {
      setStatus('Introduce un código válido de 6 dígitos', true);
      return;
    }
    await loadListByCode(code);
  }

  async function checkUrlForCode() {
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get('code');
    if (codeFromUrl && codeFromUrl.length === 6) {
      if (joinCodeInput) joinCodeInput.value = codeFromUrl;
      await loadListByCode(codeFromUrl);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  if (joinBtn) joinBtn.addEventListener('click', joinWithCode);
  if (createListBtn) createListBtn.addEventListener('click', createNewList);
  if (exitBtn) exitBtn.addEventListener('click', exitList);
  if (addItemBtn) addItemBtn.addEventListener('click', addItem);
  if (copyLinkBtn) copyLinkBtn.addEventListener('click', copyShareLink);
  if (newItemName) {
    newItemName.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') addItem();
    });
  }
  if (joinCodeInput) {
    joinCodeInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') joinWithCode();
    });
  }

  checkUrlForCode();
  console.log('✅ SuperList inicializada correctamente');
}