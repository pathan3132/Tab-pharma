// 📱 PWA Service Worker Registration & Install Trigger
let deferredPrompt;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then((reg) => console.log('Tab-Pharma PWA Service Worker Registered:', reg.scope))
      .catch((err) => console.log('SW registration error:', err));
  });
}

// Listen for PWA Install Prompt Event
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;

  // Agar user ne pehle dismiss nahi kiya hai toh banner dikhayein
  if (!localStorage.getItem('pwa_dismissed')) {
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) banner.style.display = 'flex';
  }

  const headerBtn = document.getElementById('headerInstallBtn');
  if (headerBtn) headerBtn.style.display = 'inline-flex';
});

function triggerPWAInstall() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User installed Tab-Pharma PWA');
      }
      deferredPrompt = null;
      dismissPWABanner();
    });
  } else {
    alert("App install karne ke liye apne browser menu (⋮) me jakar 'Install App' ya 'Add to Home Screen' chunein!");
  }
}

function dismissPWABanner() {
  const banner = document.getElementById('pwaInstallBanner');
  if (banner) banner.style.display = 'none';
  localStorage.setItem('pwa_dismissed', 'true');
}

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbygUy7ifkxzOIExrDJ_wqV3YU5Q5uhJH3BFSm3Q2TMqv9G2LRbYne89N1vQAwKiU9x06g/exec";

// Global Stores & Profiles
let storeProfile = JSON.parse(localStorage.getItem('tab_pharma_store_profile') || 'null');
let uploadedLogoBase64 = "";

let globalInventory = [];
let currentCart = [];
let currentPurchaseCart = [];
let currentSaleMode = 'strip';
let currentPaymentMode = 'Cash'; // 'Cash' | 'UPI' | 'Udhaar'
let isCurrentMedicineExpired = false;
let currentHistoryMode = 'khata';

let deskFilterCategory = 'all'; // 'all' | 'expired' | 'soon'
let selectedExpiryKeys = new Set(); // Stores unique keys of selected expiry items

let allSalesHistory = JSON.parse(localStorage.getItem('tab_cache_sales') || '[]');
let allPurchaseHistory = JSON.parse(localStorage.getItem('tab_cache_purchases') || '[]');

// Safe Date Parser
function parseSafeDate(dateStr) {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  if (typeof dateStr === 'string' && /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(dateStr)) {
    const parts = dateStr.split(/[/-]/);
    return new Date(parts[2], parts[1] - 1, parts[0]);
  }
  return new Date(dateStr);
}

// 1. Startup Logic
window.onload = function() {
  checkShopSetup();
  loadInventory();
  loadTodaySalesSummary();
};

function checkShopSetup() {
  if (!storeProfile || !storeProfile.shopName) {
    document.getElementById('shopProfileModal').style.display = 'flex';
  } else {
    applyShopProfileToUI();
  }
}

function openShopSettingsModal() {
  if (storeProfile) {
    document.getElementById('setupShopName').value = storeProfile.shopName || '';
    document.getElementById('setupOwnerName').value = storeProfile.ownerName || '';
    document.getElementById('setupShopPhone').value = storeProfile.phone || '';
    document.getElementById('setupShopAddress').value = storeProfile.address || '';
    document.getElementById('setupShopDL').value = storeProfile.dlNo || '';

    if (storeProfile.logo) {
      document.getElementById('shopLogoPreview').src = storeProfile.logo;
      document.getElementById('shopLogoPreview').style.display = 'block';
      document.getElementById('shopLogoPlaceholder').style.display = 'none';
    }
  }
  document.getElementById('shopProfileModal').style.display = 'flex';
}

function handleLogoUpload(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    uploadedLogoBase64 = e.target.result;
    document.getElementById('shopLogoPreview').src = uploadedLogoBase64;
    document.getElementById('shopLogoPreview').style.display = 'block';
    document.getElementById('shopLogoPlaceholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function saveShopProfile() {
  const shopName = document.getElementById('setupShopName').value.trim();
  const ownerName = document.getElementById('setupOwnerName').value.trim();
  const phone = document.getElementById('setupShopPhone').value.trim();
  const address = document.getElementById('setupShopAddress').value.trim();
  const dlNo = document.getElementById('setupShopDL').value.trim();

  if (!shopName || !phone || !address) {
    alert("Kripya Dukan Ka Naam, Mobile aur Pata zaroor bharein!");
    return;
  }

  storeProfile = {
    shopName: shopName,
    ownerName: ownerName,
    phone: phone,
    address: address,
    dlNo: dlNo,
    logo: uploadedLogoBase64 || (storeProfile ? storeProfile.logo : "")
  };

  localStorage.setItem('tab_pharma_store_profile', JSON.stringify(storeProfile));
  document.getElementById('shopProfileModal').style.display = 'none';
  
  applyShopProfileToUI();
  alert(`🎉 Badhai ho! "${shopName}" ka setup pura ho gaya!`);
}

function applyShopProfileToUI() {
  if (!storeProfile) return;

  document.getElementById('headerShopName').innerText = storeProfile.shopName;
  document.getElementById('headerShopCity').innerText = storeProfile.address.split(',')[0] || "Tab Solution";

  const logoImg = document.getElementById('headerShopLogoImg');
  const logoIcon = document.getElementById('defaultLogoIcon');

  if (storeProfile.logo) {
    logoImg.src = storeProfile.logo;
    logoImg.style.display = 'block';
    logoIcon.style.display = 'none';
  } else {
    logoImg.style.display = 'none';
    logoIcon.style.display = 'block';
  }
}

function openSupportModal() {
  document.getElementById('tabSolutionSupportModal').style.display = 'flex';
}

function closeSupportModal() {
  document.getElementById('tabSolutionSupportModal').style.display = 'none';
}

// 2. Tab Navigation
function showTab(tabId, btnElement) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active-content'));
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));

  document.getElementById(tabId).classList.add('active-content');
  if (btnElement) btnElement.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 3. Load Inventory
async function loadInventory() {
  try {
    if (SCRIPT_URL && !SCRIPT_URL.includes("YOUR_GOOGLE_APPS_SCRIPT_URL_HERE")) {
      const res = await fetch(`${SCRIPT_URL}?action=getInventory`);
      const json = await res.json();
      if (json.status === 'success') {
        globalInventory = json.data;
      }
    } else {
      globalInventory = [
        { Medicine_Name: "Dolo 650", Batch_No: "DL-901", Expiry_Date: "2026-10-25", Current_Qty: "20 Strip", Purchase_Rate: 22, MRP: 30 },
        { Medicine_Name: "Deriphyllin Retard", Batch_No: "DR-110", Expiry_Date: "2026-12-10", Current_Qty: "15 Strip", Purchase_Rate: 32, MRP: 45 },
        { Medicine_Name: "Disprin Regular", Batch_No: "DS-404", Expiry_Date: "2027-01-15", Current_Qty: "50 Strip", Purchase_Rate: 8, MRP: 12 },
        { Medicine_Name: "Duphaston 10mg", Batch_No: "DP-221", Expiry_Date: "2026-11-20", Current_Qty: "10 Strip", Purchase_Rate: 510, MRP: 650 },
        { Medicine_Name: "Azithromycin 500mg", Batch_No: "AZ-203", Expiry_Date: "2026-08-10", Current_Qty: "15 Strip", Purchase_Rate: 85, MRP: 120 },
        { Medicine_Name: "Pan-D Capsule", Batch_No: "PN-440", Expiry_Date: "2027-04-15", Current_Qty: "40 Strip", Purchase_Rate: 130, MRP: 180 },
        { Medicine_Name: "Paracetamol 500", Batch_No: "PC-889", Expiry_Date: "2026-09-05", Current_Qty: "20 Strip", Purchase_Rate: 14, MRP: 20 }
      ];
    }
    
    updateDashboardMetrics();
    filterInventoryCards();
  } catch (err) {
    console.error("Data Load Error: ", err);
  }
}

// 4. Update Home Dashboard Metrics
function updateDashboardMetrics() {
  let expired = 0, expiringSoon = 0, lowStock = 0;
  const today = new Date();

  globalInventory.forEach(item => {
    const qtyNum = parseFloat(item.Current_Qty) || 0;
    if (qtyNum > 0) {
      const expDate = parseSafeDate(item.Expiry_Date);
      const daysDiff = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
      
      if (daysDiff < 0) expired++;
      else if (daysDiff <= 60) expiringSoon++;
      
      if (qtyNum < 10) lowStock++;
    }
  });

  document.getElementById('expired-count').innerText = expired;
  document.getElementById('expiring-count').innerText = expiringSoon;
  document.getElementById('low-stock-count').innerText = lowStock;
}

// 5. 📦 EXPIRY RETURN DESK LOGIC (Full Checkbox & Bulk Actions Engine)
function openExpiryDesk(category = 'all') {
  deskFilterCategory = category;
  selectedExpiryKeys.clear();

  document.querySelectorAll('#expiryDeskModal .chip').forEach(c => c.classList.remove('active'));
  const targetChip = Array.from(document.querySelectorAll('#expiryDeskModal .chip')).find(c => 
    (category === 'all' && c.innerText.includes('Sabhi')) ||
    (category === 'expired' && c.innerText.includes('Expired')) ||
    (category === 'soon' && c.innerText.includes('60 Din'))
  );
  if (targetChip) targetChip.classList.add('active');

  document.getElementById('deskSelectAllCheck').checked = false;
  document.getElementById('deskSearchInput').value = '';

  renderExpiryDeskItems();
  document.getElementById('expiryDeskModal').style.display = 'flex';
}

function closeExpiryDesk() {
  document.getElementById('expiryDeskModal').style.display = 'none';
}

function filterDeskCategory(category, chipEl) {
  deskFilterCategory = category;
  document.querySelectorAll('#expiryDeskModal .chip').forEach(c => c.classList.remove('active'));
  if (chipEl) chipEl.classList.add('active');
  renderExpiryDeskItems();
}

function getActiveExpiryList() {
  const query = (document.getElementById('deskSearchInput')?.value || '').toLowerCase();
  const today = new Date();

  return globalInventory.filter(item => {
    const qtyNum = parseFloat(item.Current_Qty) || 0;
    if (qtyNum <= 0) return false; // Hide out-of-stock items

    const expDate = parseSafeDate(item.Expiry_Date);
    const daysDiff = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

    // Category filter
    let matchCat = false;
    if (deskFilterCategory === 'expired') matchCat = daysDiff < 0;
    else if (deskFilterCategory === 'soon') matchCat = daysDiff >= 0 && daysDiff <= 60;
    else matchCat = daysDiff <= 60; // All expiring + expired

    if (!matchCat) return false;

    // Search query filter
    return (
      item.Medicine_Name.toLowerCase().includes(query) ||
      item.Batch_No.toLowerCase().includes(query) ||
      item.Expiry_Date.includes(query)
    );
  });
}

function renderExpiryDeskItems() {
  const container = document.getElementById('expiryDeskList');
  const items = getActiveExpiryList();
  const today = new Date();

  if (items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-circle-check" style="color:#16a34a; font-size:2.5rem;"></i>
        <p>Koi bhi expired ya urgent dawa nahi bachi hai.</p>
      </div>
    `;
    updateSelectedBadge();
    return;
  }

  container.innerHTML = items.map(item => {
    const key = `${item.Medicine_Name}_${item.Batch_No}`;
    const isChecked = selectedExpiryKeys.has(key);
    const expDate = parseSafeDate(item.Expiry_Date);
    const daysDiff = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

    let badge = daysDiff < 0 
      ? `<span class="badge-pill danger">🚨 Expired (${Math.abs(daysDiff)}d pehle)</span>`
      : `<span class="badge-pill warning">⏳ ${daysDiff} Din Baki</span>`;

    return `
      <div class="desk-item-card ${isChecked ? 'selected' : ''}" onclick="toggleExpiryItemSelect('${key.replace(/'/g, "\\'")}')">
        <input type="checkbox" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); toggleExpiryItemSelect('${key.replace(/'/g, "\\'")}')">
        <div class="desk-item-details">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <b>${item.Medicine_Name}</b>
            <span style="font-weight:800; color:#0f172a;">${item.Current_Qty}</span>
          </div>
          <div style="font-size:0.75rem; color:#64748b; margin: 2px 0;">
            Batch: <b>${item.Batch_No}</b> | Exp: <b>${item.Expiry_Date}</b> | MRP: ₹${item.MRP}
          </div>
          <div>${badge}</div>
        </div>
      </div>
    `;
  }).join('');

  updateSelectedBadge();
}

function toggleExpiryItemSelect(key) {
  if (selectedExpiryKeys.has(key)) {
    selectedExpiryKeys.delete(key);
  } else {
    selectedExpiryKeys.add(key);
  }
  renderExpiryDeskItems();
}

function toggleDeskSelectAll(masterCheckbox) {
  const items = getActiveExpiryList();
  if (masterCheckbox.checked) {
    items.forEach(it => selectedExpiryKeys.add(`${it.Medicine_Name}_${it.Batch_No}`));
  } else {
    selectedExpiryKeys.clear();
  }
  renderExpiryDeskItems();
}

function updateSelectedBadge() {
  const count = selectedExpiryKeys.size;
  document.getElementById('selectedCountBadge').innerText = `${count} Selected`;
}

function getSelectedExpiryObjects() {
  return globalInventory.filter(item => selectedExpiryKeys.has(`${item.Medicine_Name}_${item.Batch_No}`));
}

// 6. 📄 Print / Generate PDF Return Challan for Selected Items
function printSelectedExpiryPDF() {
  const selected = getSelectedExpiryObjects();
  if (selected.length === 0) {
    alert("Kripya pehle kam se kam 1 dawa tick (select) karein!");
    return;
  }

  const sName = storeProfile ? storeProfile.shopName : "TAB-PHARMA STORE";
  const sPhone = storeProfile ? storeProfile.phone : "+91 9876543210";
  const sAddr = storeProfile ? storeProfile.address : "Medical & Healthcare Store";
  const sDL = storeProfile && storeProfile.dlNo ? `DL No: ${storeProfile.dlNo}` : "";

  let printWindow = window.open('', '_blank');
  let printContent = `
    <html>
      <head>
        <title>Distributor Expiry Return Challan - ${sName}</title>
        <style>
          body { font-family: sans-serif; padding: 20px; color: #1e293b; }
          .header { border-bottom: 2px solid #ef4444; padding-bottom: 10px; margin-bottom: 15px; }
          .header h2 { color: #b91c1c; margin: 0 0 4px 0; }
          .header p { margin: 0; font-size: 13px; color: #64748b; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; font-size: 12px; }
          th { background-color: #fee2e2; color: #991b1b; }
          .footer { margin-top: 30px; display: flex; justify-content: space-between; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>📦 EXPIRY RETURN CLAIM CHALLAN</h2>
          <p><b>${sName}</b> | ${sAddr} | Ph: ${sPhone} ${sDL ? ' | ' + sDL : ''}</p>
          <p>Challan Date: ${new Date().toLocaleDateString('en-GB')} | Total Return Items: ${selected.length}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Medicine Name</th>
              <th>Batch No</th>
              <th>Expiry Date</th>
              <th>Return Qty</th>
              <th>MRP</th>
            </tr>
          </thead>
          <tbody>
            ${selected.map((item, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><b>${item.Medicine_Name}</b></td>
                <td>${item.Batch_No}</td>
                <td>${item.Expiry_Date}</td>
                <td><b>${item.Current_Qty}</b></td>
                <td>₹${item.MRP}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="footer">
          <div><b>Receiver Agency Sign & Stamp:</b> ____________</div>
          <div><b>Authorized Signatory:</b> ${sName}</div>
        </div>
      </body>
    </html>
  `;

  printWindow.document.write(printContent);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); }, 500);
}

// 7. 📲 Send Selected Items Claim to WhatsApp
function sendSelectedExpiryWhatsApp() {
  const selected = getSelectedExpiryObjects();
  if (selected.length === 0) {
    alert("Kripya pehle kam se kam 1 dawa tick (select) karein!");
    return;
  }

  const sName = storeProfile ? storeProfile.shopName : "TAB-PHARMA STORE";
  const sPhone = storeProfile ? storeProfile.phone : "";

  let msg = `*📦 EXPIRY RETURN CLAIM - ${sName}*\n`;
  if (sPhone) msg += `Contact: ${sPhone}\n`;
  msg += `Date: ${new Date().toLocaleDateString('en-GB')}\n`;
  msg += `------------------------------------\n`;
  selected.forEach((it, idx) => {
    msg += `${idx + 1}. *${it.Medicine_Name}*\n   Batch: ${it.Batch_No} | Qty: ${it.Current_Qty} (Exp: ${it.Expiry_Date})\n`;
  });
  msg += `------------------------------------\n`;
  msg += `*Kul Selected Dawa: ${selected.length} Items*\nKripya iska Credit Note / Return banayein.\n_Powered by Tab-Pharma (Tab Solution)_`;

  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
}

// 8. 📦 Bulk Mark Selected as Returned (Stock 0 & List se hatayein)
async function bulkMarkSelectedAsReturned() {
  const selected = getSelectedExpiryObjects();
  if (selected.length === 0) {
    alert("Kripya pehle kam se kam 1 dawa tick (select) karein!");
    return;
  }

  if (!confirm(`Kya aapne yeh ${selected.length} dawaiyan Agency ko wapas de di hain?\n\nInka stock 0 ho jayega aur yeh list se hamesha ke liye hat jayengi.`)) {
    return;
  }

  // 1. Local inventory update
  selected.forEach(item => {
    item.Current_Qty = "0 Strip";
  });

  selectedExpiryKeys.clear();

  // 2. UI Refresh
  updateDashboardMetrics();
  renderExpiryDeskItems();
  filterInventoryCards();

  // 3. Backend Sync
  try {
    if (SCRIPT_URL && !SCRIPT_URL.includes("YOUR_GOOGLE_APPS_SCRIPT_URL_HERE")) {
      const returnItems = selected.map(it => ({
        medicineName: it.Medicine_Name,
        batchNo: it.Batch_No,
        qty: "Return",
        deductQty: 9999,
        mrp: 0,
        total: 0
      }));

      await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "makeSale",
          invoiceId: "RET-" + new Date().getTime().toString().slice(-4),
          customerMobile: "Agency Return",
          customerName: "Distributor Return",
          paymentMode: "Expiry Return",
          totalAmount: 0,
          items: returnItems
        })
      });
    }
    alert(`✅ ${selected.length} dawaiyan Agency ko return darj ho gayi aur list se hat gayi!`);
  } catch (err) {
    console.error("Sync error:", err);
  }
}

// 9. Stepper & Autocomplete Helpers
function stepQty(inputId, step) {
  const el = document.getElementById(inputId);
  let val = Number(el.value) || 0;
  val = Math.max(1, val + step);
  el.value = val;
  calcItemSubtotal();
}

function showSuggestions(input, boxId) {
  const query = input.value.trim().toLowerCase();
  const box = document.getElementById(boxId);

  if (!query) {
    box.style.display = 'none';
    return;
  }

  const uniqueMeds = [...new Set(globalInventory.map(item => item.Medicine_Name))].filter(Boolean);

  const matched = uniqueMeds.filter(name => name.toLowerCase().includes(query))
    .sort((a, b) => {
      const aStarts = a.toLowerCase().startsWith(query);
      const bStarts = b.toLowerCase().startsWith(query);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.localeCompare(b);
    });

  if (matched.length === 0) {
    box.innerHTML = `<div class="suggestion-item" style="color: #94a3b8;"><i class="fa-solid fa-plus-circle"></i> "${input.value}"</div>`;
    box.style.display = 'block';
    return;
  }

  box.innerHTML = matched.map(med => `
    <div class="suggestion-item" onclick="selectSuggestion('${input.id}', '${boxId}', '${med.replace(/'/g, "\\'")}')">
      <i class="fa-solid fa-pills" style="color:#0d9488;"></i> 
      <span>${med}</span>
    </div>
  `).join('');

  box.style.display = 'block';
}

function selectSuggestion(inputId, boxId, medName) {
  document.getElementById(inputId).value = medName;
  document.getElementById(boxId).style.display = 'none';

  if (inputId === 'posMedName') {
    autoFillPOSDetails(medName);
  } else if (inputId === 'stockMedName') {
    // 🚚 Purchase Form me purana batch auto-fill karein
    const existing = globalInventory.find(item => item.Medicine_Name && item.Medicine_Name.toLowerCase() === medName.toLowerCase());
    if (existing) {
      document.getElementById('stockBatchNo').value = existing.Batch_No || '';
      document.getElementById('stockExpiryDate').value = existing.Expiry_Date || '';
      document.getElementById('stockMrp').value = existing.MRP || '';
      document.getElementById('stockPurchaseRate').value = existing.Purchase_Rate || '';
    }
  }
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.autocomplete-wrapper')) {
    document.querySelectorAll('.suggestions-box').forEach(box => box.style.display = 'none');
  }
});

// 10. POS Sale Mode, Cart & Billing
// 6. POS Smart Selection (Hamesha Fresh / Non-Expired Stock Pehle Uthayega)
function autoFillPOSDetails(medName) {
  const batches = globalInventory.filter(item => 
    item.Medicine_Name && item.Medicine_Name.toLowerCase() === medName.toLowerCase()
  );
  if (batches.length === 0) return;

  const today = new Date();

  // Step 1: Sirf wahi batch dekhein jinka stock dukan me bacha hai (> 0)
  const inStockBatches = batches.filter(b => (parseFloat(b.Current_Qty) || 0) > 0);
  const targetPool = inStockBatches.length > 0 ? inStockBatches : batches;

  // Step 2: Fresh (Non-Expired) Batches ko alag filter karein
  const freshBatches = targetPool.filter(b => {
    const exp = parseSafeDate(b.Expiry_Date);
    return Math.ceil((exp - today) / (1000 * 60 * 60 * 24)) >= 0;
  });

  let bestBatch;

  // Step 3: Agar dukan me nayi / fresh dawa aa chuki hai, toh wahi select karo!
  if (freshBatches.length > 0) {
    // Fresh batches me se jo sabse pehle expire hogi (FEFO) use chuno
    freshBatches.sort((a, b) => parseSafeDate(a.Expiry_Date) - parseSafeDate(b.Expiry_Date));
    bestBatch = freshBatches[0];
  } else {
    // Agar sari hi dawaiyan expire hain, tab majboori me expired batch uthao warning ke sath
    targetPool.sort((a, b) => parseSafeDate(b.Expiry_Date) - parseSafeDate(a.Expiry_Date));
    bestBatch = targetPool[0];
  }
  
  const expDate = parseSafeDate(bestBatch.Expiry_Date);
  const daysDiff = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

  // Form me batch details bharein
  document.getElementById('posBatchInfo').style.display = 'flex';
  document.getElementById('posSelectedBatch').innerText = bestBatch.Batch_No;
  document.getElementById('posSelectedExpiry').innerText = bestBatch.Expiry_Date;
  document.getElementById('posAvailableStock').innerText = bestBatch.Current_Qty;
  document.getElementById('posRate').value = bestBatch.MRP;
  document.getElementById('posQty').value = 1;

  // Warning Banner Logic
  const banner = document.getElementById('posExpiredBanner');
  if (daysDiff < 0) {
    isCurrentMedicineExpired = true;
    banner.style.display = 'flex';
    document.getElementById('posExpiredDateText').innerText = `${bestBatch.Expiry_Date} (${Math.abs(daysDiff)} din pehle expired)`;
  } else {
    // Agar fresh batch hai, toh warning band rahegi
    isCurrentMedicineExpired = false;
    banner.style.display = 'none';
  }

  calcItemSubtotal();
}

function setSaleMode(mode) {
  currentSaleMode = mode;
  const btnStrip = document.getElementById('btnModeStrip');
  const btnLoose = document.getElementById('btnModeLoose');
  const fullRow = document.getElementById('fullStripRow');
  const looseRow = document.getElementById('looseTabletRow');

  if (mode === 'strip') {
    btnStrip.classList.add('active');
    btnLoose.classList.remove('active');
    fullRow.style.display = 'flex';
    looseRow.style.display = 'none';
  } else {
    btnStrip.classList.remove('active');
    btnLoose.classList.add('active');
    fullRow.style.display = 'none';
    looseRow.style.display = 'block';
  }
  calcItemSubtotal();
}

function setPaymentMode(mode) {
  currentPaymentMode = mode;
  document.querySelectorAll('.pay-btn').forEach(btn => btn.classList.remove('active'));
  
  const nameField = document.getElementById('custNameField');

  if (mode === 'Cash') {
    document.getElementById('payModeCash').classList.add('active');
    nameField.style.display = 'none';
  } else if (mode === 'UPI') {
    document.getElementById('payModeUPI').classList.add('active');
    nameField.style.display = 'none';
  } else {
    document.getElementById('payModeUdhaar').classList.add('active');
    nameField.style.display = 'block';
  }
}

function calcItemSubtotal() {
  const stripRate = Number(document.getElementById('posRate').value) || 0;
  let total = 0;

  if (currentSaleMode === 'strip') {
    const qty = Number(document.getElementById('posQty').value) || 0;
    total = qty * stripRate;
  } else {
    const looseCount = Number(document.getElementById('posLooseCount').value) || 0;
    const tabsPerStrip = Number(document.getElementById('posTabsPerStrip').value) || 10;
    const perTabletRate = stripRate / tabsPerStrip;
    document.getElementById('perTabPriceDisplay').innerText = `₹${perTabletRate.toFixed(2)}`;
    total = Math.round(looseCount * perTabletRate * 100) / 100;
  }

  document.getElementById('itemSubtotalDisplay').innerText = `₹${total}`;
  return total;
}

function addItemToCart(forceExpired = false) {
  const medName = document.getElementById('posMedName').value.trim();
  const batchNo = document.getElementById('posSelectedBatch').innerText;
  const expiryDate = document.getElementById('posSelectedExpiry').innerText;
  const rate = Number(document.getElementById('posRate').value) || 0;
  const itemTotal = calcItemSubtotal();

  if (!medName || !batchNo || batchNo === '-') {
    alert("Kripya pehle dawa search karke select karein!");
    return;
  }

  if (itemTotal <= 0) {
    alert("Quantity aur MRP sahi daalein!");
    return;
  }

  if (isCurrentMedicineExpired && !forceExpired) {
    document.getElementById('modalMedName').innerText = medName;
    document.getElementById('modalExpDate').innerText = expiryDate;
    document.getElementById('expiredAlertModal').style.display = 'flex';
    return;
  }
  closeExpiredModal();

  let qtyDesc = "";
  let deductQty = 0;

  if (currentSaleMode === 'strip') {
    const qty = Number(document.getElementById('posQty').value);
    qtyDesc = `${qty} Strip`;
    deductQty = qty;
  } else {
    const loose = Number(document.getElementById('posLooseCount').value);
    const perStrip = Number(document.getElementById('posTabsPerStrip').value) || 10;
    qtyDesc = `${loose} Tabs`;
    deductQty = (loose / perStrip);
  }

  currentCart.push({
    medicineName: medName,
    batchNo: batchNo,
    expiryDate: expiryDate,
    qty: qtyDesc,
    deductQty: deductQty,
    mrp: rate,
    total: itemTotal
  });

  renderCartUI();

  document.getElementById('posMedName').value = '';
  document.getElementById('posBatchInfo').style.display = 'none';
  document.getElementById('posExpiredBanner').style.display = 'none';
  document.getElementById('posQty').value = '1';
  document.getElementById('posRate').value = '';
  document.getElementById('itemSubtotalDisplay').innerText = '₹0';
  isCurrentMedicineExpired = false;
  setSaleMode('strip');
}

function renderCartUI() {
  const container = document.getElementById('cartItemsList');
  document.getElementById('cartBadge').innerText = `${currentCart.length} Item`;

  if (currentCart.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-cart-shopping"></i>
        <p>Bill khali hai. Upar se dawa add karein.</p>
      </div>
    `;
    calculateFinalBill();
    return;
  }

  container.innerHTML = currentCart.map((item, idx) => `
    <div class="cart-item-card">
      <div class="cart-item-info">
        <b>${item.medicineName}</b>
        <small>Batch: ${item.batchNo} | Qty: ${item.qty} @ ₹${item.mrp}</small>
      </div>
      <div class="cart-item-price">
        <div class="amount">₹${item.total}</div>
        <button class="delete-btn" onclick="removeFromCart(${idx})"><i class="fa-solid fa-trash-can"></i></button>
      </div>
    </div>
  `).join('');

  calculateFinalBill();
}

function removeFromCart(index) {
  currentCart.splice(index, 1);
  renderCartUI();
}

function calculateFinalBill() {
  const totalAmount = currentCart.reduce((sum, item) => sum + item.total, 0);
  document.getElementById('finalNetPayable').innerText = `₹${totalAmount}`;
  return totalAmount;
}

function closeExpiredModal() {
  document.getElementById('expiredAlertModal').style.display = 'none';
}

async function submitFinalBill(isPrint = false) {
  if (currentCart.length === 0) {
    alert("Bill me kam se kam 1 dawa jodna zaroori hai!");
    return;
  }

  const totalAmount = calculateFinalBill();
  const mobile = document.getElementById('posCustomerMobile').value.trim();
  const custName = document.getElementById('posCustomerName').value.trim();

  if (currentPaymentMode === 'Udhaar' && !custName) {
    alert("Udhaar bill ke liye Customer Ka Naam likhna zaroori hai!");
    document.getElementById('posCustomerName').focus();
    return;
  }

  const invoiceId = "INV-" + new Date().getTime().toString().slice(-5);
  const btn = document.getElementById('posSaleBtn');

  btn.innerText = "Saving...";
  btn.disabled = true;

  const salePayload = {
    action: "makeSale",
    invoiceId: invoiceId,
    customerMobile: mobile || "Counter Sale",
    customerName: custName || "Counter Customer",
    paymentMode: currentPaymentMode,
    totalAmount: totalAmount,
    items: currentCart
  };

  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(salePayload)
    });
    const result = await res.json();

    if (result.status === "success") {
      if (isPrint) {
        printThermalSlip(invoiceId, currentCart, totalAmount);
      }

      const successBox = document.getElementById('billSuccessBox');
      const waBtn = document.getElementById('whatsappShareBtn');
      successBox.style.display = 'block';

      if (mobile && mobile.length >= 10) {
        const sName = storeProfile ? storeProfile.shopName : "TAB-PHARMA STORE";
        const sPhone = storeProfile ? storeProfile.phone : "";
        const sAddr = storeProfile ? storeProfile.address : "";

        let msg = `*${sName}*\n${sAddr} | Ph: ${sPhone}\n`;
        msg += `------------------------------------\n`;
        msg += `Invoice: ${invoiceId} | Mode: ${currentPaymentMode}\n`;
        msg += `------------------------------------\n`;
        currentCart.forEach(it => msg += `${it.medicineName} (${it.qty}) - Rs.${it.total}\n`);
        msg += `------------------------------------\n`;
        msg += `*Kul Rashi: Rs.${totalAmount}*\n\nGet Well Soon! Jaldi theek ho jayein 🙏\n_Powered by Tab-Pharma • Tab Solution (Ph: 8329962703)_`;
        
        waBtn.style.display = 'inline-flex';
        waBtn.onclick = () => window.open(`https://wa.me/91${mobile}?text=${encodeURIComponent(msg)}`, '_blank');
      } else {
        waBtn.style.display = 'none';
      }

      currentCart = [];
      renderCartUI();
      document.getElementById('posCustomerMobile').value = '';
      document.getElementById('posCustomerName').value = '';
      setPaymentMode('Cash');

      loadInventory();
      loadTodaySalesSummary();
      loadSalesHistory();
    }
  } catch (error) {
    console.error("Sale Error:", error);
    alert("Bill save nahi ho paya. Connection check karein.");
  } finally {
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Save Parcha';
    btn.disabled = false;
  }
}

function printThermalSlip(invId, items, total) {
  let printWin = window.open('', '_blank');
  const sName = storeProfile ? storeProfile.shopName : "TAB-PHARMA STORE";
  const sPhone = storeProfile ? storeProfile.phone : "+91 9876543210";
  const sAddr = storeProfile ? storeProfile.address : "Medical & Healthcare Store";
  const sDL = storeProfile && storeProfile.dlNo ? `DL No: ${storeProfile.dlNo}<br>` : "";
  const sLogo = storeProfile && storeProfile.logo ? `<img src="${storeProfile.logo}" style="max-height:38px; margin-bottom:4px;"><br>` : "";

  let slipHtml = `
    <html>
      <head>
        <title>Receipt - ${invId}</title>
        <style>
          @page { margin: 0; }
          body { font-family: 'Courier New', monospace; width: 58mm; padding: 6px; margin: 0 auto; font-size: 11px; }
          .center { text-align: center; }
          .line { border-top: 1px dashed #000; margin: 5px 0; }
          .row { display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div class="center">
          ${sLogo}
          <b style="font-size:13px;">${sName}</b><br>
          ${sAddr}<br>
          Ph: ${sPhone}<br>
          ${sDL}
        </div>
        <div class="line"></div>
        <div class="row"><span>Inv: ${invId}</span><span>${new Date().toLocaleDateString('en-GB')}</span></div>
        <div class="line"></div>
        ${items.map(it => `
          <div style="margin-bottom:3px;">
            <b>${it.medicineName}</b><br>
            <div class="row">
              <span>${it.qty} @ ₹${it.mrp}</span>
              <span>₹${it.total}</span>
            </div>
          </div>
        `).join('')}
        <div class="line"></div>
        <div class="row" style="font-size:13px; font-weight:bold;"><span>TOTAL:</span><span>₹${total}</span></div>
        <div class="line"></div>
        <div class="center" style="font-size:9px;">
          *** GET WELL SOON ***<br>
          Software by: Tab Solution (Aurangabad)<br>
          Ph: +91 8329962703 / 7773966580
        </div>
      </body>
    </html>
  `;

  printWin.document.write(slipHtml);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => { printWin.print(); }, 500);
}

// 11. Purchase Module Logic
function handleUnitChange() {
  const unit = document.getElementById('stockUnitType').value;
  const boxDiv = document.getElementById('boxMultiplierDiv');
  boxDiv.style.display = (unit === 'Box') ? 'block' : 'none';
  calcPurchaseItemTotal();
}

function calcPurchaseItemTotal() {
  const unit = document.getElementById('stockUnitType').value;
  const qty = Number(document.getElementById('stockQty').value) || 0;
  const freeQty = Number(document.getElementById('stockFreeQty').value) || 0;
  const stripsPerBox = Number(document.getElementById('stripsPerBox').value) || 1;
  const purchaseRate = Number(document.getElementById('stockPurchaseRate').value) || 0;

  const totalUnits = (unit === 'Box') ? ((qty + freeQty) * stripsPerBox) : (qty + freeQty);
  const finalUnitName = (unit === 'Box') ? 'Strip' : unit;
  const totalItemCost = qty * purchaseRate;

  document.getElementById('totalSellableDisplay').innerText = `${totalUnits} ${finalUnitName}s (${qty} + ${freeQty} Free)`;
  document.getElementById('itemCostDisplay').innerText = `₹${totalItemCost}`;

  return { totalUnits, finalUnitName, totalItemCost, qty, freeQty, purchaseRate };
}

function addItemToPurchaseInvoice() {
  const medName = document.getElementById('stockMedName').value.trim();
  const batchNo = document.getElementById('stockBatchNo').value.trim();
  const expiryDate = document.getElementById('stockExpiryDate').value;
  const mrp = Number(document.getElementById('stockMrp').value) || 0;

  const { totalUnits, finalUnitName, totalItemCost, purchaseRate } = calcPurchaseItemTotal();

  if (!medName || !batchNo || !expiryDate || totalUnits <= 0 || purchaseRate <= 0 || mrp <= 0) {
    alert("Kripya Medicine, Batch, Expiry, Qty, Purchase Rate aur MRP bharein!");
    return;
  }

  currentPurchaseCart.push({
    medicineName: medName,
    batchNo: batchNo,
    expiryDate: expiryDate,
    unitType: finalUnitName,
    qty: `${totalUnits} ${finalUnitName}`,
    purchaseRate: purchaseRate,
    mrp: mrp,
    totalCost: totalItemCost
  });

  renderPurchaseCartUI();

  document.getElementById('stockMedName').value = '';
  document.getElementById('stockBatchNo').value = '';
  document.getElementById('stockExpiryDate').value = '';
  document.getElementById('stockQty').value = '';
  document.getElementById('stockFreeQty').value = '0';
  document.getElementById('stockPurchaseRate').value = '';
  document.getElementById('stockMrp').value = '';
  document.getElementById('totalSellableDisplay').innerText = '0 Strips';
  document.getElementById('itemCostDisplay').innerText = '₹0';
}

function renderPurchaseCartUI() {
  const container = document.getElementById('purchaseCartList');
  document.getElementById('purchaseCartBadge').innerText = `${currentPurchaseCart.length} Item`;

  if (currentPurchaseCart.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-truck-loading"></i>
        <p>Koi dawa add nahi hui hai.</p>
      </div>
    `;
    document.getElementById('finalPurchaseCostDisplay').innerText = '₹0';
    return;
  }

  let grandTotalCost = 0;
  container.innerHTML = currentPurchaseCart.map((item, idx) => {
    grandTotalCost += item.totalCost;
    return `
      <div class="cart-item-card">
        <div class="cart-item-info">
          <b>${item.medicineName}</b>
          <small>Batch: ${item.batchNo} | Qty: ${item.qty}</small><br>
          <small>Rate: ₹${item.purchaseRate} | MRP: ₹${item.mrp}</small>
        </div>
        <div class="cart-item-price">
          <div class="amount">₹${item.totalCost}</div>
          <button class="delete-btn" onclick="removeFromPurchaseCart(${idx})"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('finalPurchaseCostDisplay').innerText = `₹${grandTotalCost}`;
}

function removeFromPurchaseCart(index) {
  currentPurchaseCart.splice(index, 1);
  renderPurchaseCartUI();
}

async function submitFinalPurchaseBill() {
  if (currentPurchaseCart.length === 0) {
    alert("Kripya pehle Purchase Bill me dawa jodein!");
    return;
  }

  const supplierName = document.getElementById('purchSupplierName').value.trim() || "Local Wholesaler";
  const invoiceNo = document.getElementById('purchInvoiceNo').value.trim() || ("PUR-" + new Date().getTime().toString().slice(-4));
  const btn = document.getElementById('saveStockBtn');

  btn.innerText = "Saving...";
  btn.disabled = true;

  const payload = {
    action: "addPurchaseBill",
    supplierName: supplierName,
    invoiceNo: invoiceNo,
    items: currentPurchaseCart
  };

  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.status === "success") {
      alert(`✅ Purchase Bill "${invoiceNo}" Successfully Saved!`);
      
      currentPurchaseCart = [];
      renderPurchaseCartUI();
      document.getElementById('purchSupplierName').value = '';
      document.getElementById('purchInvoiceNo').value = '';

      loadInventory();
      loadPurchaseHistory();
      showTab('stock', document.querySelectorAll('.nav-item')[4]);
    } else {
      alert("Error: " + result.message);
    }
  } catch (error) {
    console.error("Purchase Save Error:", error);
    alert("Purchase bill save nahi ho paya.");
  } finally {
    btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Stock Jama Karein';
    btn.disabled = false;
  }
}

// 12. Khata (Udhaar) & History View
function switchHistoryMode(mode) {
  currentHistoryMode = mode;
  const btnKhata = document.getElementById('btnHistKhata');
  const btnSale = document.getElementById('btnHistSale');
  const btnPurch = document.getElementById('btnHistPurch');
  const heading = document.getElementById('historyHeadingText');
  const searchInput = document.getElementById('historySearchInput');

  [btnKhata, btnSale, btnPurch].forEach(b => b.classList.remove('active'));

  if (mode === 'khata') {
    btnKhata.classList.add('active');
    heading.innerText = 'Mohalle Ka Udhaar (Baki Hisaab)';
    searchInput.placeholder = 'Search customer name or mobile...';
    renderKhataCards();
  } else if (mode === 'sale') {
    btnSale.classList.add('active');
    heading.innerText = 'Sabhi Sale Bills';
    searchInput.placeholder = 'Search by Bill No or Mobile...';
    if (allSalesHistory.length > 0) renderSalesHistoryCards(allSalesHistory);
    loadSalesHistory();
  } else {
    btnPurch.classList.add('active');
    heading.innerText = 'Sabhi Purchase Bills';
    searchInput.placeholder = 'Search by Supplier or Bill No...';
    if (allPurchaseHistory.length > 0) renderPurchaseHistoryCards(allPurchaseHistory);
    loadPurchaseHistory();
  }
}

function loadCurrentHistoryFast() {
  switchHistoryMode(currentHistoryMode);
}

function renderKhataCards(query = '') {
  const container = document.getElementById('historyCardsContainer');
  if (!container) return;

  const udhaarBills = allSalesHistory.filter(b => b.paymentMode === 'Udhaar' && !b.isPaid);

  if (udhaarBills.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-circle-check" style="color:#16a34a;"></i>
        <p>Badhai ho! Kisi ka koi udhaar baki nahi hai.</p>
      </div>
    `;
    return;
  }

  const filtered = udhaarBills.filter(b => 
    (b.customerName && b.customerName.toLowerCase().includes(query.toLowerCase())) ||
    (b.customerMobile && b.customerMobile.includes(query)) ||
    (b.invoiceId && b.invoiceId.toLowerCase().includes(query.toLowerCase()))
  );

  container.innerHTML = filtered.map((b, idx) => `
    <div class="list-item-card" style="border-left: 4px solid #ef4444;">
      <div class="card-top">
        <div>
          <div class="card-title">${b.customerName || 'Customer'}</div>
          <div class="card-subtext"><i class="fa-solid fa-phone"></i> ${b.customerMobile || 'No Mobile'} | <i class="fa-regular fa-clock"></i> ${b.date}</div>
        </div>
        <div style="font-size:1.15rem; font-weight:800; color:#ef4444;">₹${b.totalAmount}</div>
      </div>
      <div class="card-meta-row" style="margin-top: 6px;">
        <span class="badge-pill danger">Baki (उधार)</span>
        <span class="badge-pill gray">${b.items.length} Dawa</span>
        
        <div style="margin-left: auto; display: flex; gap: 6px;">
          ${b.customerMobile && b.customerMobile.length >= 10 ? `
            <button class="btn-sm btn-whatsapp" onclick="sendKhataReminderWhatsApp('${b.customerName}', '${b.customerMobile}', ${b.totalAmount}, '${b.invoiceId}')">
              <i class="fa-brands fa-whatsapp"></i> Yaad Dilayein
            </button>
          ` : ''}
          <button class="btn-sm btn-success" onclick="settleKhataBill('${b.invoiceId}')">
            <i class="fa-solid fa-check"></i> Jama Hua
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function sendKhataReminderWhatsApp(name, mobile, amount, invId) {
  const sName = storeProfile ? storeProfile.shopName : "TAB-PHARMA STORE";
  const msg = `*Namaste ${name} Ji*,\n${sName} par aapka *₹${amount}* ka dawa bill (${invId}) baki hai.\nKripya samay par jama kar dein. Dhanyawad! 🙏`;
  window.open(`https://wa.me/91${mobile}?text=${encodeURIComponent(msg)}`, '_blank');
}

function settleKhataBill(invId) {
  if (!confirm(`Kya Invoice "${invId}" ka udhaar jama ho gaya hai?`)) return;

  const bill = allSalesHistory.find(b => b.invoiceId === invId);
  if (bill) {
    bill.isPaid = true;
    bill.paymentMode = "Cash (Paid)";
    localStorage.setItem('tab_cache_sales', JSON.stringify(allSalesHistory));
    renderKhataCards();
    loadTodaySalesSummary();
    alert("✅ Udhaar Jama darj ho gaya!");
  }
}

function filterHistoryView() {
  const query = document.getElementById('historySearchInput').value.toLowerCase();
  if (currentHistoryMode === 'khata') {
    renderKhataCards(query);
  } else if (currentHistoryMode === 'sale') {
    const filtered = allSalesHistory.filter(b => 
      b.invoiceId.toLowerCase().includes(query) || 
      (b.customerMobile && b.customerMobile.includes(query)) ||
      (b.customerName && b.customerName.toLowerCase().includes(query))
    );
    renderSalesHistoryCards(filtered);
  } else {
    const filtered = allPurchaseHistory.filter(b => 
      b.invoiceNo.toLowerCase().includes(query) || 
      b.supplierName.toLowerCase().includes(query)
    );
    renderPurchaseHistoryCards(filtered);
  }
}

function refreshCurrentHistory(showSpinner = false) {
  if (showSpinner) {
    document.getElementById('historyCardsContainer').innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Syncing...</p></div>`;
  }
  loadSalesHistory();
  loadPurchaseHistory();
}

async function loadSalesHistory() {
  try {
    if (!SCRIPT_URL || SCRIPT_URL.includes("YOUR_GOOGLE_APPS_SCRIPT_URL_HERE")) return;
    const res = await fetch(`${SCRIPT_URL}?action=getSalesHistory`);
    const json = await res.json();
    if (json.status === 'success') {
      allSalesHistory = json.data;
      localStorage.setItem('tab_cache_sales', JSON.stringify(allSalesHistory));
      if (currentHistoryMode === 'sale') renderSalesHistoryCards(allSalesHistory);
      if (currentHistoryMode === 'khata') renderKhataCards();
    }
  } catch (err) { console.error(err); }
}

async function loadPurchaseHistory() {
  try {
    if (!SCRIPT_URL || SCRIPT_URL.includes("YOUR_GOOGLE_APPS_SCRIPT_URL_HERE")) return;
    const res = await fetch(`${SCRIPT_URL}?action=getPurchaseHistory`);
    const json = await res.json();
    if (json.status === 'success') {
      allPurchaseHistory = json.data;
      localStorage.setItem('tab_cache_purchases', JSON.stringify(allPurchaseHistory));
      if (currentHistoryMode === 'purchase') renderPurchaseHistoryCards(allPurchaseHistory);
    }
  } catch (err) { console.error(err); }
}

function renderSalesHistoryCards(bills) {
  const container = document.getElementById('historyCardsContainer');
  if (!container) return;

  if (bills.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-receipt"></i><p>Koi sale bill nahi hai</p></div>`;
    return;
  }

  container.innerHTML = bills.map((bill, idx) => `
    <div class="list-item-card" onclick="viewBillDetails(${idx})">
      <div class="card-top">
        <div>
          <div class="card-title">${bill.invoiceId} (${bill.customerName || 'Counter'})</div>
          <div class="card-subtext"><i class="fa-regular fa-clock"></i> ${bill.date}</div>
        </div>
        <div style="font-size:1.05rem; font-weight:800; color:#0d9488;">₹${bill.totalAmount}</div>
      </div>
      <div class="card-meta-row">
        <span class="badge-pill ${bill.paymentMode === 'Udhaar' ? 'danger' : 'success'}">${bill.paymentMode || 'Cash'}</span>
        <span class="badge-pill gray">${bill.items.length} Items</span>
        <span class="badge-pill gray" style="margin-left:auto;">Details →</span>
      </div>
    </div>
  `).join('');
}

function renderPurchaseHistoryCards(bills) {
  const container = document.getElementById('historyCardsContainer');
  if (!container) return;

  if (bills.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-truck-ramp-box"></i><p>Koi purchase bill nahi hai</p></div>`;
    return;
  }

  container.innerHTML = bills.map((bill, idx) => `
    <div class="list-item-card" onclick="viewPurchaseBillDetails(${idx})">
      <div class="card-top">
        <div>
          <div class="card-title">Bill: ${bill.invoiceNo}</div>
          <div class="card-subtext" style="color:#0284c7; font-weight:600;"><i class="fa-solid fa-truck"></i> ${bill.supplierName}</div>
        </div>
        <div style="font-size:1.05rem; font-weight:800; color:#0284c7;">₹${bill.totalCost}</div>
      </div>
      <div class="card-meta-row">
        <span class="badge-pill gray"><i class="fa-regular fa-calendar"></i> ${bill.date}</span>
        <span class="badge-pill gray">${bill.items.length} Items</span>
        <span class="badge-pill gray" style="margin-left:auto;">Details →</span>
      </div>
    </div>
  `).join('');
}

// 13. View Modals & Edit Bills
function viewBillDetails(index) {
  const bill = allSalesHistory[index];
  document.getElementById('viewModalInvId').innerText = bill.invoiceId;
  document.getElementById('viewModalDate').innerText = `${bill.date} | Mode: ${bill.paymentMode || 'Cash'} | Customer: ${bill.customerName || 'Counter'}`;
  document.getElementById('viewModalTotal').innerText = `₹${bill.totalAmount}`;

  const container = document.getElementById('viewModalItemsList');
  container.innerHTML = bill.items.map(it => `
    <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #f1f5f9; font-size:0.85rem;">
      <div><b>${it.medicineName}</b><br><small style="color:#64748b;">Batch: ${it.batchNo} (${it.qty})</small></div>
      <div style="font-weight:700;">₹${it.total}</div>
    </div>
  `).join('');

  document.getElementById('modalReprintBtn').onclick = () => {
    printThermalSlip(bill.invoiceId, bill.items, bill.totalAmount);
  };
  document.getElementById('modalEditBtn').onclick = () => {
    editBill(index);
  };

  document.getElementById('billDetailModal').style.display = 'flex';
}

function closeBillDetailModal() {
  document.getElementById('billDetailModal').style.display = 'none';
}

function viewPurchaseBillDetails(index) {
  const bill = allPurchaseHistory[index];
  document.getElementById('viewPurchInvNo').innerText = `Bill: ${bill.invoiceNo}`;
  document.getElementById('viewPurchSupplier').innerText = `Supplier: ${bill.supplierName}`;
  document.getElementById('viewPurchDate').innerText = `Date: ${bill.date}`;
  document.getElementById('viewPurchTotalCost').innerText = `₹${bill.totalCost}`;

  const container = document.getElementById('viewPurchItemsList');
  container.innerHTML = bill.items.map(it => `
    <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #f1f5f9; font-size:0.85rem;">
      <div><b>${it.medicineName}</b><br><small style="color:#64748b;">${it.batchNo} | Exp: ${it.expiryDate} | ${it.qty}</small></div>
      <div style="font-weight:700; color:#0284c7;">₹${it.totalCost}</div>
    </div>
  `).join('');

  document.getElementById('modalPurchEditBtn').onclick = () => {
    editPurchaseBill(index);
  };

  document.getElementById('purchDetailModal').style.display = 'flex';
}

function closePurchDetailModal() {
  document.getElementById('purchDetailModal').style.display = 'none';
}

async function editBill(index) {
  const bill = allSalesHistory[index];
  if (!confirm(`Invoice "${bill.invoiceId}" me badlaav karna chahte hain? Stock revert hoke Cart me aa jayega.`)) return;

  const btn = document.getElementById('modalEditBtn');
  btn.innerText = "Restoring...";
  btn.disabled = true;

  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "cancelAndRestoreStock", invoiceId: bill.invoiceId })
    });
    const result = await res.json();

    if (result.status === "success") {
      closeBillDetailModal();
      currentCart = bill.items.map(it => ({
        medicineName: it.medicineName,
        batchNo: it.batchNo,
        expiryDate: "-",
        qty: it.qty,
        deductQty: it.qty.includes('Tabs') ? ((parseFloat(it.qty) || 1) / 10) : (parseFloat(it.qty) || 1),
        mrp: it.mrp || (it.total / (parseFloat(it.qty) || 1)),
        total: it.total
      }));

      document.getElementById('posCustomerMobile').value = (bill.customerMobile === 'Counter Sale') ? '' : (bill.customerMobile || '');
      document.getElementById('posCustomerName').value = (bill.customerName === 'Counter Customer') ? '' : (bill.customerName || '');
      setPaymentMode(bill.paymentMode || 'Cash');

      renderCartUI();
      showTab('pos', document.querySelectorAll('.nav-item')[1]);
      alert(`✅ Bill "${bill.invoiceId}" Cart me load ho gaya hai!`);
      loadInventory();
      loadTodaySalesSummary();
    }
  } catch (err) {
    alert("Error edit karne me");
  } finally {
    btn.innerHTML = '<i class="fa-solid fa-pen"></i> Edit Bill';
    btn.disabled = false;
  }
}

async function editPurchaseBill(index) {
  const bill = allPurchaseHistory[index];
  if (!confirm(`Supplier "${bill.supplierName}" ka Bill "${bill.invoiceNo}" edit karein?`)) return;

  const btn = document.getElementById('modalPurchEditBtn');
  btn.innerText = "Reverting...";
  btn.disabled = true;

  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "cancelAndRevertPurchase", invoiceNo: bill.invoiceNo, supplierName: bill.supplierName })
    });
    const result = await res.json();

    if (result.status === "success") {
      closePurchDetailModal();
      currentPurchaseCart = bill.items.map(it => ({
        medicineName: it.medicineName,
        batchNo: it.batchNo,
        expiryDate: it.expiryDate,
        unitType: it.qty.replace(/[0-9.]/g, '').trim() || 'Strip',
        qty: it.qty,
        purchaseRate: it.purchaseRate,
        mrp: it.mrp || (it.purchaseRate * 1.25),
        totalCost: it.totalCost
      }));

      document.getElementById('purchSupplierName').value = bill.supplierName;
      document.getElementById('purchInvoiceNo').value = bill.invoiceNo;

      renderPurchaseCartUI();
      showTab('purchase', document.querySelectorAll('.nav-item')[3]);
      alert(`✅ Purchase Bill "${bill.invoiceNo}" form me load ho gaya!`);
      loadInventory();
      loadPurchaseHistory();
    }
  } catch (err) {
    alert("Error reverting purchase");
  } finally {
    btn.innerHTML = '<i class="fa-solid fa-pen"></i> Edit Purchase';
    btn.disabled = false;
  }
}

// 14. Inventory Cards View
function filterInventoryCards() {
  const query = (document.getElementById('inventorySearchInput')?.value || '').toLowerCase();
  const container = document.getElementById('allInventoryCards');
  if (!container) return;

  const filtered = globalInventory.filter(item => 
    (item.Medicine_Name && item.Medicine_Name.toLowerCase().includes(query)) ||
    (item.Batch_No && item.Batch_No.toString().toLowerCase().includes(query)) ||
    (item.Expiry_Date && item.Expiry_Date.toString().includes(query))
  );

  document.getElementById('totalItemsCount').innerText = `${filtered.length} Items`;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i><p>Koi dawa nahi mili</p></div>`;
    return;
  }

  container.innerHTML = filtered.map(item => {
    const qtyNum = parseInt(item.Current_Qty) || 0;
    const isLow = qtyNum < 5;

    return `
      <div class="list-item-card">
        <div class="card-top">
          <div>
            <div class="card-title">${item.Medicine_Name}</div>
            <div class="card-subtext">Batch: <b>${item.Batch_No}</b> | Exp: <b>${item.Expiry_Date}</b></div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:1.05rem; font-weight:800; color:${isLow ? '#ef4444' : '#0f172a'};">${item.Current_Qty}</div>
            <small style="color:#64748b;">MRP ₹${item.MRP}</small>
          </div>
        </div>
        <div class="card-meta-row">
          <span class="badge-pill gray">Purchase: ₹${item.Purchase_Rate || 0}</span>
          ${isLow ? '<span class="badge-pill danger">⚠️ Kam Stock</span>' : '<span class="badge-pill success">Stock Ok</span>'}
        </div>
      </div>
    `;
  }).join('');
}

// 15. Daily Galla Summary
async function loadTodaySalesSummary() {
  try {
    if (!SCRIPT_URL || SCRIPT_URL.includes("YOUR_GOOGLE_APPS_SCRIPT_URL_HERE")) return;
    const res = await fetch(`${SCRIPT_URL}?action=getTodaySales`);
    const json = await res.json();
    if (json.status === 'success') {
      document.getElementById('todaySaleAmount').innerText = `₹${json.totalAmount || 0}`;
      document.getElementById('todayCashAmount').innerText = `₹${json.cashAmount || 0}`;
      document.getElementById('todayUpiAmount').innerText = `₹${json.upiAmount || 0}`;
      document.getElementById('todayUdhaarAmount').innerText = `₹${json.udhaarAmount || 0}`;
      document.getElementById('todayBillCount').innerText = `${json.totalBills || 0} Parcha`;
    }
  } catch (err) {}
}
