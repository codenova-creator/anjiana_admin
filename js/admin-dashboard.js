import { 
  db, collection, getDocs, addDoc, doc, updateDoc, deleteDoc, getDoc, setDoc, query, where, orderBy, limit,
  auth, onAuthStateChanged
} from './firebase-config.js';
import { checkAndSeedData } from './seed.js';

// Global variables to store chart instances
let salesChartInstance = null;
let detailedChartInstance = null;

// Temporary cache for multi-image uploads
let selectedProductImageFiles = []; // Array of File objects or string URLs
let cachedCategories = [];
let currentEditingProductId = "";
let currentEditingStaffId = "";
let currentUserRole = "Staff"; // Default restriction mode

// Helper to get active currency symbol
function getActiveCurrency() {
  const el = document.getElementById('setCurrency');
  return el ? el.value : "Rs.";
}

// --------------------------------------------------
// ROUTING ENGINE (Hash-Based SPA)
// --------------------------------------------------

const VIEWS = {
  dashboard: { title: "Dashboard", desc: "Overview of your store's performance metrics." },
  products: { title: "Product Management", desc: "Manage your clothing catalog and stock details." },
  "add-product": { title: "Add Clothing Item", desc: "Create a new product listing with variants and images." },
  categories: { title: "Category Management", desc: "Organize clothing by departments, subcategories, and targets." },
  inventory: { title: "Inventory Management", desc: "Track variant quantities, log restocks, and review history." },
  payments: { title: "Payment Ledger", desc: "Monitor store sales transactions, payment types, and refund actions." },
  shipping: { title: "Shipping Setup", desc: "Dispatch courier tracks and set up standard delivery fees." },
  discounts: { title: "Discounts & Campaigns", desc: "Manage coupon codes, seasonal sales, and homepage slides." },
  reviews: { title: "Reviews & Feedback", desc: "Review customer feedback, approve ratings, and reply to posts." },
  reports: { title: "Reports & Analytics", desc: "Generate sales trends, inventory valuations, and returns ratios." },
  staff: { title: "Staff & Role Management", desc: "Manage team permissions and audit login access records." },
  settings: { title: "Store Settings", desc: "Configure currency, local taxes, emails, and social links." }
};

function switchView(hash) {
  // Extract path and query params (e.g. #add-product?id=xyz)
  let cleanHash = hash.replace(/^#/, '');
  let queryParams = {};
  
  if (cleanHash.includes('?')) {
    const parts = cleanHash.split('?');
    cleanHash = parts[0];
    const queryStr = parts[1];
    const searchParams = new URLSearchParams(queryStr);
    for (const [key, value] of searchParams.entries()) {
      queryParams[key] = value;
    }
  }

  if (!cleanHash || !VIEWS[cleanHash]) {
    cleanHash = 'dashboard';
  }

  // Routing permission guard for Staff role
  const restrictedTabs = ['categories', 'payments', 'shipping', 'discounts', 'staff', 'settings'];
  if (currentUserRole === 'Staff' && restrictedTabs.includes(cleanHash)) {
    cleanHash = 'dashboard';
  }

  // Hide all tab panes
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  
  // Show target tab pane
  const targetPane = document.getElementById(cleanHash);
  if (targetPane) {
    targetPane.classList.add('active');
  }

  // Update header text
  const viewInfo = VIEWS[cleanHash];
  document.getElementById('viewTitle').textContent = viewInfo.title;
  document.getElementById('viewDesc').textContent = viewInfo.desc;

  // Highlight active sidebar item
  document.querySelectorAll('.admin-nav .nav-item').forEach(el => {
    if (el.getAttribute('data-tab') === cleanHash) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Execute view-specific initializations
  triggerViewInit(cleanHash, queryParams);
}

// --------------------------------------------------
// VIEW INITIALIZER DISPATCHER
// --------------------------------------------------

function triggerViewInit(viewName, params) {
  switch (viewName) {
    case 'dashboard':
      loadDashboardKPIs();
      break;
    case 'products':
      loadProductsList();
      break;
    case 'add-product':
      initAddProductForm(params.id);
      break;
    case 'categories':
      loadCategoriesList();
      break;
    case 'inventory':
      loadInventoryView();
      break;
    case 'payments':
      loadPaymentsLedger();
      break;
    case 'shipping':
      loadShippingView();
      break;
    case 'discounts':
      loadDiscountsView();
      break;
    case 'reviews':
      loadReviewsList();
      break;
    case 'reports':
      loadReportsView();
      break;
    case 'staff':
      loadStaffView();
      break;
    case 'settings':
      loadSettingsView();
      break;
  }
}

// --------------------------------------------------
// TOAST NOTIFICATIONS & FEEDBACK UTILS
// --------------------------------------------------

function showToast(message, isError = false) {
  const toast = document.getElementById('toastNotification');
  const toastIcon = document.getElementById('toastIcon');
  const toastTitle = document.getElementById('toastTitle');
  const toastMessage = document.getElementById('toastMessage');

  if (!toast) return;

  if (isError) {
    toast.classList.add('error');
    if (toastIcon) toastIcon.textContent = '✕';
    if (toastTitle) toastTitle.textContent = 'Error';
  } else {
    toast.classList.remove('error');
    if (toastIcon) toastIcon.textContent = '✓';
    if (toastTitle) toastTitle.textContent = 'Success';
  }

  if (toastMessage) toastMessage.textContent = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

// Seeding module now imported from seed.js

// --------------------------------------------------
// 1. DASHBOARD MODULE & KPIS
// --------------------------------------------------

async function loadDashboardKPIs() {
  try {
    const ordersSnap = await getDocs(collection(db, "orders"));
    const customersSnap = await getDocs(collection(db, "customers"));
    const productsSnap = await getDocs(collection(db, "products"));

    let totalSalesVal = 0;
    let ordersCountVal = 0;
    let lowStockCountVal = 0;

    const monthlySales = { "Jan": 0, "Feb": 0, "Mar": 0, "Apr": 0, "May": 0, "Jun": 0, "Jul": 0, "Aug": 0, "Sep": 0, "Oct": 0, "Nov": 0, "Dec": 0 };
    const recentOrders = [];
    const bestSellersMap = {};

    ordersSnap.forEach(docSnap => {
      const order = docSnap.data();
      const orderId = docSnap.id;
      
      // Calculate only valid orders (exclude Cancelled/Returned)
      if (order.orderStatus !== 'Cancelled' && order.orderStatus !== 'Returned') {
        totalSalesVal += parseFloat(order.totalAmount || 0);
        ordersCountVal++;

        // Calculate best-selling products count
        if (order.items && Array.isArray(order.items)) {
          order.items.forEach(item => {
            bestSellersMap[item.name] = (bestSellersMap[item.name] || 0) + parseInt(item.quantity || 1);
          });
        }
      }

      // Get monthly breakdown for charts based on createdAt timestamp
      if (order.createdAt) {
        const date = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
        const monthName = date.toLocaleString('default', { month: 'short' });
        if (monthlySales[monthName] !== undefined) {
          monthlySales[monthName] += parseFloat(order.totalAmount || 0);
        }
      }

      // Buffer orders for Recent Orders table
      recentOrders.push({
        id: orderId,
        customerName: `${order.customer.firstName} ${order.customer.lastName}`,
        payment: `${order.paymentMethod || 'COD'} (${order.paymentStatus || 'Pending'})`,
        shipping: order.courier ? `${order.courier}` : 'Unassigned',
        total: order.totalAmount,
        status: order.orderStatus,
        createdAt: order.createdAt
      });
    });

    // Count low stock items (global products and variants counts where stock <= 5)
    productsSnap.forEach(docSnap => {
      const prod = docSnap.data();
      if (prod.variants && prod.variants.length > 0) {
        prod.variants.forEach(variant => {
          if (parseInt(variant.stock) <= 5) {
            lowStockCountVal++;
          }
        });
      } else {
        if (parseInt(prod.stock) <= 5) {
          lowStockCountVal++;
        }
      }
    });

    // Populate UI elements
    const setCurrency = getActiveCurrency();
    document.getElementById('kpiSales').textContent = `${setCurrency}${totalSalesVal.toFixed(2)}`;
    document.getElementById('kpiOrders').textContent = ordersCountVal;
    document.getElementById('kpiCustomers').textContent = customersSnap.size;
    document.getElementById('kpiLowStock').textContent = lowStockCountVal;

    const lowStockFooter = document.getElementById('kpiLowStockFooter');
    if (lowStockFooter) {
      if (lowStockCountVal > 0) {
        lowStockFooter.textContent = `⚠️ Action needed: ${lowStockCountVal} low stock item(s)`;
        lowStockFooter.style.color = 'var(--error-color)';
      } else {
        lowStockFooter.textContent = 'All inventory stock margins healthy';
        lowStockFooter.style.color = 'var(--success-color)';
      }
    }

    // Render Recent Orders table
    renderDashboardRecentOrders(recentOrders);

    // Render Monthly Performance Chart
    renderSalesChart(monthlySales);

    // Render Best Sellers list
    renderBestSellersList(bestSellersMap);

  } catch (err) {
    console.error("Dashboard KPI loading error:", err);
  }
}

function renderDashboardRecentOrders(orders) {
  const tbody = document.getElementById('recentOrdersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  // Sort orders descending by date
  orders.sort((a, b) => {
    const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
    const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
    return dateB - dateA;
  });

  const displayOrders = orders.slice(0, 5);
  if (displayOrders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No orders logged.</td></tr>`;
    return;
  }

  displayOrders.forEach(ord => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-family: monospace; font-size: 0.9rem;">${ord.id.slice(0, 8)}...</td>
      <td style="font-weight: 500;">${ord.customerName}</td>
      <td style="font-size: 0.85rem;">${ord.payment}</td>
      <td style="font-size: 0.85rem;">${ord.shipping}</td>
      <td style="font-weight: 600;">${getActiveCurrency()}${parseFloat(ord.total).toFixed(2)}</td>
      <td><span class="status-pill status-${ord.status.toLowerCase()}">${ord.status}</span></td>
      <td>
        <button class="btn btn-secondary view-order-details-btn" data-id="${ord.id}" style="padding: 4px 8px; font-size: 0.8rem;">Details</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Attach detail listeners
  tbody.querySelectorAll('.view-order-details-btn').forEach(btn => {
    btn.addEventListener('click', () => openOrderDetailModal(btn.getAttribute('data-id')));
  });
}

function renderBestSellersList(bestSellersMap) {
  const container = document.getElementById('bestSellersContainer');
  if (!container) return;
  container.innerHTML = '';

  const sortedList = Object.entries(bestSellersMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (sortedList.length === 0) {
    container.innerHTML = `<p class="text-muted" style="text-align: center; padding: 2rem 0;">No sales recorded.</p>`;
    return;
  }

  const ul = document.createElement('ul');
  ul.style.display = 'flex';
  ul.style.flexDirection = 'column';
  ul.style.gap = '10px';
  ul.style.padding = '0';

  sortedList.forEach(([name, count]) => {
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    li.style.alignItems = 'center';
    li.style.borderBottom = '1px solid var(--border-color)';
    li.style.paddingBottom = '8px';
    li.innerHTML = `
      <span style="font-weight: 500; font-size: 0.9rem;">${name}</span>
      <span style="background: rgba(212, 175, 55, 0.15); color: var(--accent-color); padding: 2px 8px; border-radius: 20px; font-size: 0.8rem; font-weight: 600;">${count} sold</span>
    `;
    ul.appendChild(li);
  });

  container.appendChild(ul);
}

function renderSalesChart(monthlySalesData) {
  const ctx = document.getElementById('salesChart');
  if (!ctx) return;

  if (salesChartInstance) {
    salesChartInstance.destroy();
  }

  const labels = Object.keys(monthlySalesData);
  const data = Object.values(monthlySalesData);

  salesChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: `Gross Monthly Sales (${getActiveCurrency()})`,
        data: data,
        borderColor: '#D4AF37',
        backgroundColor: 'rgba(212, 175, 55, 0.08)',
        fill: true,
        tension: 0.35,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.03)' } },
        x: { grid: { display: false } }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

// --------------------------------------------------
// 2. PRODUCT MANAGEMENT MODULE (Catalog lists)
// --------------------------------------------------

async function loadProductsList() {
  const tbody = document.getElementById('productsTableBody');
  if (!tbody) return;

  try {
    const qSnap = await getDocs(collection(db, "products"));
    tbody.innerHTML = '';

    if (qSnap.empty) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center;">No products in database. Set up your catalog.</td></tr>`;
      return;
    }

    qSnap.forEach(docSnap => {
      const prod = docSnap.data();
      const id = docSnap.id;
      
      const stockStatus = prod.stock > 10 
        ? `<span style="background: #E8F5E9; color: #2E7D32; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">In Stock (${prod.stock})</span>`
        : prod.stock > 0 
          ? `<span style="background: #FFE0B2; color: #E65100; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">Low Stock (${prod.stock})</span>`
          : `<span style="background: #FFEBEE; color: #C62828; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">Out of Stock (0)</span>`;

      const price = parseFloat(prod.price);
      const discount = parseFloat(prod.discount || 0);
      let priceHTML = `${getActiveCurrency()}${price.toFixed(2)}`;
      if (discount > 0) {
        priceHTML = `
          <div style="display: flex; flex-direction: column;">
            <span style="text-decoration: line-through; color: var(--text-muted); font-size: 0.75rem;">${getActiveCurrency()}${price.toFixed(2)}</span>
            <span style="font-weight: 600; color: var(--accent-color); font-size: 0.9rem;">${getActiveCurrency()}${discount.toFixed(2)}</span>
          </div>
        `;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><img src="${prod.imageUrl || '../images/placeholder.png'}" style="width: 40px; height: 50px; object-fit: cover; border-radius: 4px;"></td>
        <td style="font-weight: 500;">${prod.name}</td>
        <td style="color: var(--text-muted); font-size: 0.85rem;">${prod.brand || 'N/A'}</td>
        <td style="color: var(--text-muted); font-size: 0.85rem;">${prod.category}</td>
        <td>${priceHTML}</td>
        <td>${stockStatus}</td>
        <td><span class="status-pill status-${prod.status === 'Available' ? 'delivered' : 'cancelled'}">${prod.status || 'Available'}</span></td>
        <td>
          <a href="#add-product?id=${id}" class="btn btn-secondary edit-product-btn" style="padding: 6px 12px; font-size: 0.8rem; height: 32px; margin-right: 4px;">Edit</a>
          <button class="btn delete-product-btn" data-id="${id}" style="padding: 6px 12px; font-size: 0.8rem; background: #FFEBEE; color: #C62828; height: 32px;">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Attach listeners
    tbody.querySelectorAll('.delete-product-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm("Are you sure you want to permanently delete this product and its stock counts?")) {
          await deleteDoc(doc(db, "products", id));
          showToast("Product deleted successfully!");
          loadProductsList();
        }
      });
    });

  } catch (err) {
    console.error("Error loading products catalog list:", err);
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: red;">Failed to load products database.</td></tr>`;
  }
}

// --------------------------------------------------
// 3. ADD / EDIT PRODUCT FORM MODULE
// --------------------------------------------------

async function initAddProductForm(editId) {
  const form = document.getElementById('productForm');
  if (!form) return;
  form.reset();

  currentEditingProductId = editId || "";
  document.getElementById('editProductId').value = currentEditingProductId;
  selectedProductImageFiles = [];
  document.getElementById('multiImagePreviews').innerHTML = '';

  const addProductTitle = document.getElementById('addProductTitle');
  const saveProductBtn = document.getElementById('saveProductBtn');

  // Load category selections dynamically
  const catSelect = document.getElementById('prodCategory');
  if (catSelect) {
    catSelect.innerHTML = '';
    cachedCategories = [];
    try {
      const catsSnap = await getDocs(collection(db, "categories"));
      catsSnap.forEach(cDoc => {
        const c = cDoc.data();
        cachedCategories.push({ id: cDoc.id, ...c });
      });

      // Ensure "Other" category exists
      let hasOther = cachedCategories.some(c => c.name.toLowerCase() === 'other');
      if (!hasOther) {
        const otherData = {
          name: "Other",
          gender: "Unisex",
          parent: "",
          image: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=200",
          createdAt: new Date()
        };
        const newCatRef = await addDoc(collection(db, "categories"), otherData);
        cachedCategories.push({ id: newCatRef.id, ...otherData });
      }
    } catch (err) {
      console.error("Error loading categories for cache:", err);
    }

    const currentGender = document.getElementById('prodGender').value || 'Women';
    populateCategoryDropdown(currentGender);
  }

  if (currentEditingProductId) {
    addProductTitle.textContent = "Edit Clothing Item Details";
    saveProductBtn.textContent = "Update Listing";

    // Load existing document data
    try {
      const snap = await getDoc(doc(db, "products", currentEditingProductId));
      if (snap.exists()) {
        const data = snap.data();
        document.getElementById('prodName').value = data.name || '';
        document.getElementById('prodBrand').value = data.brand || '';
        const genderVal = data.gender || 'Women';
        document.getElementById('prodGender').value = genderVal;
        populateCategoryDropdown(genderVal, data.category || '');
        document.getElementById('prodMaterial').value = data.material || '';
        document.getElementById('prodPrice').value = data.price || 0;
        document.getElementById('prodDiscount').value = data.discount || '';
        document.getElementById('prodSku').value = data.sku || '';
        document.getElementById('prodDesc').value = data.description || '';
        document.getElementById('prodSingleStock').value = data.stock || 0;

        // Status
        document.querySelectorAll('input[name="prodStatus"]').forEach(inp => {
          inp.checked = inp.value === data.status;
        });

        // Set checkboxes sizes
        document.querySelectorAll('input[name="vSizes"]').forEach(cb => {
          cb.checked = data.sizes && data.sizes.includes(cb.value);
        });

        // Set checkboxes colors
        const defaultColorsList = ["White", "Black", "Navy", "Grey", "Beige", "Red", "Olive"];
        const customColorList = [];
        document.querySelectorAll('input[name="vColors"]').forEach(cb => {
          const isSelected = data.colors && data.colors.includes(cb.value);
          cb.checked = isSelected;
        });
        if (data.colors) {
          data.colors.forEach(col => {
            if (!defaultColorsList.includes(col)) {
              customColorList.push(col);
            }
          });
        }
        if (document.getElementById('customColors')) {
          document.getElementById('customColors').value = customColorList.join(', ');
        }

        // Load images previews
        if (data.imageUrl) {
          selectedProductImageFiles.push(data.imageUrl);
          if (data.images && Array.isArray(data.images)) {
            data.images.forEach(imgUrl => {
              if (imgUrl !== data.imageUrl) selectedProductImageFiles.push(imgUrl);
            });
          }
          renderImagePreviews();
        }

        // Build matrix table if variants exist
        if (data.variants && data.variants.length > 0) {
          document.getElementById('variantMatrixContainer').style.display = 'block';
          document.getElementById('singleStockContainer').style.display = 'none';
          
          const tbody = document.getElementById('variantMatrixBody');
          tbody.innerHTML = '';
          data.variants.forEach(variant => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td>${variant.size}</td>
              <td>${variant.color}</td>
              <td><input type="number" class="form-control matrix-stock-input" value="${variant.stock}" min="0" style="width: 80px;" data-size="${variant.size}" data-color="${variant.color}"></td>
              <td><input type="text" class="form-control matrix-sku-input" value="${variant.sku || ''}" placeholder="SKU Barcode" data-size="${variant.size}" data-color="${variant.color}"></td>
            `;
            tbody.appendChild(tr);
          });
        }

      }
    } catch (err) {
      console.error("Load edit product error:", err);
    }
  } else {
    addProductTitle.textContent = "Add New Clothing Item";
    saveProductBtn.textContent = "Save Product Listing";
    document.getElementById('variantMatrixContainer').style.display = 'none';
    document.getElementById('singleStockContainer').style.display = 'block';
  }
}

function populateCategoryDropdown(gender, selectedCategoryValue = '') {
  const catSelect = document.getElementById('prodCategory');
  if (!catSelect) return;

  catSelect.innerHTML = '';

  const subCategories = [];
  const unisexCategories = [];
  const otherCategories = [];

  cachedCategories.forEach(c => {
    const isOther = c.name.toLowerCase() === 'other';
    
    if (isOther) {
      otherCategories.push(c);
    } else if (c.parent === gender || (c.gender === gender && c.parent)) {
      subCategories.push(c);
    } else if (c.gender === 'Unisex' || c.parent === 'Unisex') {
      unisexCategories.push(c);
    }
  });

  // Helper to create options
  const addOption = (c, groupElement) => {
    const opt = document.createElement('option');
    opt.value = `${c.parent ? c.parent + ' • ' : ''}${c.name}`;
    opt.textContent = `${c.parent ? c.parent + ' • ' : ''}${c.name}`;
    groupElement.appendChild(opt);
  };

  // Add subcategories group
  if (subCategories.length > 0) {
    const group = document.createElement('optgroup');
    group.label = `${gender} Department`;
    subCategories.forEach(c => addOption(c, group));
    catSelect.appendChild(group);
  }

  // Add unisex/general group
  if (unisexCategories.length > 0) {
    const group = document.createElement('optgroup');
    group.label = "Unisex / General";
    unisexCategories.forEach(c => addOption(c, group));
    catSelect.appendChild(group);
  }

  // Add others group
  if (otherCategories.length > 0) {
    const group = document.createElement('optgroup');
    group.label = "Accessories & Other";
    otherCategories.forEach(c => addOption(c, group));
    catSelect.appendChild(group);
  }

  // Set the selected value if provided
  if (selectedCategoryValue) {
    catSelect.value = selectedCategoryValue;
  }
}

// Handler for generating product variants stock inputs matrix
function updateProductVariantsMatrix() {
  const checkedSizes = Array.from(document.querySelectorAll('input[name="vSizes"]:checked')).map(cb => cb.value);
  
  const checkedColors = Array.from(document.querySelectorAll('input[name="vColors"]:checked')).map(cb => cb.value);
  const customColorStr = document.getElementById('customColors') ? document.getElementById('customColors').value.trim() : '';
  const customColors = customColorStr ? customColorStr.split(',').map(c => c.trim()).filter(Boolean) : [];
  const colors = [...new Set([...checkedColors, ...customColors])];

  const matrixContainer = document.getElementById('variantMatrixContainer');
  const singleStockContainer = document.getElementById('singleStockContainer');
  const tbody = document.getElementById('variantMatrixBody');

  if (checkedSizes.length > 0 && colors.length > 0) {
    matrixContainer.style.display = 'block';
    singleStockContainer.style.display = 'none';

    // Store existing input states to not overwrite typed keys
    const currentValues = {};
    document.querySelectorAll('.matrix-stock-input').forEach(inp => {
      const key = `${inp.getAttribute('data-size')}_${inp.getAttribute('data-color')}`;
      currentValues[key] = {
        stock: inp.value,
        sku: document.querySelector(`.matrix-sku-input[data-size="${inp.getAttribute('data-size')}"][data-color="${inp.getAttribute('data-color')}"]`)?.value || ''
      };
    });

    tbody.innerHTML = '';
    checkedSizes.forEach(size => {
      colors.forEach(color => {
        const key = `${size}_${color}`;
        const stockVal = currentValues[key] ? currentValues[key].stock : '0';
        const skuVal = currentValues[key] ? currentValues[key].sku : `${document.getElementById('prodSku').value || 'SKU'}-${size}-${color.substring(0,3).toUpperCase()}`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${size}</td>
          <td>${color}</td>
          <td><input type="number" class="form-control matrix-stock-input" value="${stockVal}" min="0" style="width: 80px;" data-size="${size}" data-color="${color}"></td>
          <td><input type="text" class="form-control matrix-sku-input" value="${skuVal}" placeholder="SKU Barcode" data-size="${size}" data-color="${color}"></td>
        `;
        tbody.appendChild(tr);
      });
    });
  } else {
    matrixContainer.style.display = 'none';
    singleStockContainer.style.display = 'block';
  }
}

// Multiple image upload preview builders
function handleMultiImages(files) {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    // Create temporary blob URLs for display
    const previewUrl = URL.createObjectURL(file);
    // Cache the actual file object along with URL reference
    selectedProductImageFiles.push(file);
  }
  renderImagePreviews();
}

function renderImagePreviews() {
  const container = document.getElementById('multiImagePreviews');
  container.innerHTML = '';
  
  selectedProductImageFiles.forEach((fileOrUrl, idx) => {
    let src = '';
    if (typeof fileOrUrl === 'string') {
      src = fileOrUrl;
    } else {
      src = URL.createObjectURL(fileOrUrl);
    }

    const div = document.createElement('div');
    div.className = 'preview-thumb-wrapper';
    div.innerHTML = `
      <img src="${src}" class="preview-thumb">
      <button type="button" class="remove-thumb-btn" data-index="${idx}">&times;</button>
    `;
    container.appendChild(div);
  });

  // Attach delete click actions
  container.querySelectorAll('.remove-thumb-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.getAttribute('data-index'));
      selectedProductImageFiles.splice(index, 1);
      renderImagePreviews();
    });
  });
}

// --------------------------------------------------
// 4. CATEGORY MANAGEMENT
// --------------------------------------------------

async function loadCategoriesList() {
  const tbody = document.getElementById('categoriesTableBody');
  const catParentSelect = document.getElementById('catParent');
  if (!tbody) return;

  try {
    const qSnap = await getDocs(collection(db, "categories"));
    tbody.innerHTML = '';
    
    if (catParentSelect) {
      catParentSelect.innerHTML = `<option value="">None (Top-Level Category)</option>`;
    }

    if (qSnap.empty) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center;">No categories configured.</td></tr>`;
      return;
    }

    qSnap.forEach(docSnap => {
      const cat = docSnap.data();
      const id = docSnap.id;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><img src="${cat.image || 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=100'}" style="width: 45px; height: 45px; object-fit: cover; border-radius: 50%;"></td>
        <td style="font-weight: 600;">${cat.name}</td>
        <td><span class="status-pill status-processing">${cat.gender}</span></td>
        <td style="color: var(--text-muted);">${cat.parent ? `Sub of <strong>${cat.parent}</strong>` : 'Top-Level'}</td>
        <td>
          <button class="btn btn-secondary edit-cat-btn" data-id="${id}" data-name="${cat.name}" data-gender="${cat.gender}" data-parent="${cat.parent || ''}" data-image="${cat.image || ''}" style="padding: 4px 8px; font-size: 0.8rem; margin-right: 4px;">Edit</button>
          <button class="btn delete-cat-btn" data-id="${id}" style="padding: 4px 8px; font-size: 0.8rem; background: #FFEBEE; color: #C62828;">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);

      // Add parents option to select
      if (catParentSelect && !cat.parent) {
        const opt = document.createElement('option');
        opt.value = cat.name;
        opt.textContent = cat.name;
        catParentSelect.appendChild(opt);
      }
    });

    // Attach listeners
    tbody.querySelectorAll('.edit-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('categoryFormTitle').textContent = "Edit Category Details";
        document.getElementById('editCategoryId').value = btn.getAttribute('data-id');
        document.getElementById('catName').value = btn.getAttribute('data-name');
        document.getElementById('catGender').value = btn.getAttribute('data-gender');
        document.getElementById('catParent').value = btn.getAttribute('data-parent');
        document.getElementById('catImage').value = btn.getAttribute('data-image');
        document.getElementById('resetCategoryFormBtn').style.display = 'block';
      });
    });

    tbody.querySelectorAll('.delete-cat-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm("Delete this category? Products pointing to this will not be deleted but category lookup mapping updates will occur.")) {
          await deleteDoc(doc(db, "categories", id));
          showToast("Category deleted successfully.");
          loadCategoriesList();
        }
      });
    });

  } catch (err) {
    console.error("Categories fetch error:", err);
  }
}

// --------------------------------------------------
// 5. INVENTORY & STOCK HISTORIES
// --------------------------------------------------

async function loadInventoryView() {
  const tbody = document.getElementById('inventoryTableBody');
  if (!tbody) return;

  try {
    const qSnap = await getDocs(collection(db, "products"));
    tbody.innerHTML = '';
    
    let counter = 0;
    qSnap.forEach(docSnap => {
      const prod = docSnap.data();
      const pId = docSnap.id;

      if (prod.variants && prod.variants.length > 0) {
        prod.variants.forEach(v => {
          const row = document.createElement('tr');
          const isLow = v.stock <= 5;
          row.innerHTML = `
            <td style="font-weight: 500;">${prod.name}</td>
            <td>${v.size}</td>
            <td>${v.color}</td>
            <td style="font-family: monospace; font-size: 0.85rem;">${v.sku || 'N/A'}</td>
            <td style="font-weight: 600; color: ${isLow ? 'var(--error-color)' : 'inherit'};">
              ${v.stock} ${isLow ? '<span style="font-size: 0.75rem; background:#FFEBEE; color:#C62828; padding:2px 6px; border-radius:4px; margin-left:4px;">Low stock</span>' : ''}
            </td>
            <td>
              <button class="btn btn-secondary restock-trigger-btn" data-id="${pId}" data-name="${prod.name}" data-size="${v.size}" data-color="${v.color}" data-stock="${v.stock}" style="padding: 4px 8px; font-size: 0.8rem;">Restock</button>
            </td>
          `;
          tbody.appendChild(row);
          counter++;
        });
      } else {
        const row = document.createElement('tr');
        const isLow = prod.stock <= 5;
        row.innerHTML = `
          <td style="font-weight: 500;">${prod.name}</td>
          <td>N/A</td>
          <td>N/A</td>
          <td style="font-family: monospace; font-size: 0.85rem;">${prod.sku || 'N/A'}</td>
          <td style="font-weight: 600; color: ${isLow ? 'var(--error-color)' : 'inherit'};">
            ${prod.stock} ${isLow ? '<span style="font-size: 0.75rem; background:#FFEBEE; color:#C62828; padding:2px 6px; border-radius:4px; margin-left:4px;">Low stock</span>' : ''}
          </td>
          <td>
            <button class="btn btn-secondary restock-trigger-btn" data-id="${pId}" data-name="${prod.name}" data-size="N/A" data-color="N/A" data-stock="${prod.stock}" style="padding: 4px 8px; font-size: 0.8rem;">Restock</button>
          </td>
        `;
        tbody.appendChild(row);
        counter++;
      }
    });

    if (counter === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center;">No product stocks tracked yet.</td></tr>`;
    }

    // Attach trigger event listeners
    tbody.querySelectorAll('.restock-trigger-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pId = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        const size = btn.getAttribute('data-size');
        const color = btn.getAttribute('data-color');
        const currentStock = btn.getAttribute('data-stock');

        document.getElementById('restockProductId').value = pId;
        document.getElementById('restockSize').value = size;
        document.getElementById('restockColor').value = color;
        document.getElementById('restockDetailsText').innerHTML = `Product: <strong>${name}</strong><br>Variant: size <strong>${size}</strong>, color <strong>${color}</strong><br>Current stock: <strong>${currentStock}</strong>`;
        
        document.getElementById('restockModal').classList.add('active');
      });
    });

    // Load Stock adjustment log timeline
    loadStockLogs();

  } catch (err) {
    console.error("Inventory loading error:", err);
  }
}

async function loadStockLogs() {
  const container = document.getElementById('stockLogsTimeline');
  if (!container) return;

  try {
    const logsSnap = await getDocs(collection(db, "stock_history"));
    container.innerHTML = '';

    const logs = [];
    logsSnap.forEach(docSnap => {
      logs.push(docSnap.data());
    });

    // Sort descending by date
    logs.sort((a,b) => (b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt)) - (a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt)));

    const displayLogs = logs.slice(0, 10);
    if (displayLogs.length === 0) {
      container.innerHTML = `<div class="text-muted" style="padding: 1rem 0;">No stock restock histories yet.</div>`;
      return;
    }

    displayLogs.forEach(log => {
      const div = document.createElement('div');
      div.className = `log-item ${log.type === 'RESTOCK' ? 'success' : 'warning'}`;
      
      const date = log.createdAt?.toDate ? log.createdAt.toDate() : new Date(log.createdAt);
      const timeStr = date.toLocaleString();

      div.innerHTML = `
        <strong>${log.productName}</strong> (${log.size || 'N/A'}/${log.color || 'N/A'})<br>
        <span style="font-weight:600;">${log.type === 'RESTOCK' ? '+' : '-'}${log.quantity}</span> quantity units adjusted.
        <span class="log-time">${timeStr} | by ${log.operator || 'Admin'}</span>
      `;
      container.appendChild(div);
    });

  } catch (err) {
    console.error("Logs fetching error:", err);
  }
}

// --------------------------------------------------
// 6. ORDER MODULE (Processings and Invoices)
// --------------------------------------------------

async function loadOrdersList() {
  const tbody = document.getElementById('ordersTableBodyMain');
  if (!tbody) return;

  try {
    const qSnap = await getDocs(collection(db, "orders"));
    tbody.innerHTML = '';

    if (qSnap.empty) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">No customer orders found.</td></tr>`;
      return;
    }

    qSnap.forEach(docSnap => {
      const ord = docSnap.data();
      const id = docSnap.id;
      const cust = ord.customer;

      const customerDetails = `
        <div style="font-weight: 600;">${cust.firstName} ${cust.lastName}</div>
        <div style="font-size:0.75rem; color:var(--text-muted);">${cust.email}</div>
      `;

      const paymentInfo = `
        <div style="font-weight: 500; font-size: 0.85rem;">${ord.paymentMethod || 'COD'}</div>
        <div><span class="status-pill status-${ord.paymentStatus === 'Paid' ? 'delivered' : ord.paymentStatus === 'Refunded' ? 'returned' : 'pending'}" style="font-size:0.75rem; padding: 2px 6px;">${ord.paymentStatus}</span></div>
      `;

      const courierInfo = ord.courier 
        ? `<div style="font-weight: 500; font-size: 0.85rem;">${ord.courier}</div><div style="font-family: monospace; font-size: 0.75rem; color:var(--text-muted);">${ord.trackingNumber || ''}</div>`
        : `<span style="font-size: 0.8rem; color: var(--error-color);">Pending Dispatch</span>`;

      // Return requests alerts in actions
      let returnAlert = '';
      if (ord.returnRequest && ord.returnRequest.status === 'Pending') {
        returnAlert = `<span style="background: var(--error-color); color: #fff; font-size: 0.65rem; padding: 1px 4px; border-radius: 4px; margin-left: 4px; vertical-align: middle;">REQ</span>`;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family: monospace; font-size: 0.85rem;">${id.slice(0, 8)}...</td>
        <td>${customerDetails}</td>
        <td>${paymentInfo}</td>
        <td>${courierInfo}</td>
        <td style="font-weight: 600;">${getActiveCurrency()}${parseFloat(ord.totalAmount).toFixed(2)}</td>
        <td>
          <select class="order-status-selector" data-id="${id}" style="padding: 4px; border-radius:4px; font-weight: 500; border: 1px solid var(--border-color);">
            <option value="Pending" ${ord.orderStatus === 'Pending' ? 'selected' : ''}>Pending</option>
            <option value="Confirmed" ${ord.orderStatus === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
            <option value="Packed" ${ord.orderStatus === 'Packed' ? 'selected' : ''}>Packed</option>
            <option value="Shipped" ${ord.orderStatus === 'Shipped' ? 'selected' : ''}>Shipped</option>
            <option value="Delivered" ${ord.orderStatus === 'Delivered' ? 'selected' : ''}>Delivered</option>
            <option value="Cancelled" ${ord.orderStatus === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
            <option value="Returned" ${ord.orderStatus === 'Returned' ? 'selected' : ''}>Returned</option>
          </select>
        </td>
        <td>
          <button class="btn btn-secondary order-details-trigger" data-id="${id}" style="padding: 4px 8px; font-size: 0.8rem;">Details${returnAlert}</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Attach listeners
    tbody.querySelectorAll('.order-status-selector').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        const oId = sel.getAttribute('data-id');
        const newStatus = e.target.value;
        try {
          await updateDoc(doc(db, "orders", oId), { orderStatus: newStatus });
          showToast(`Order status updated to ${newStatus}`);
          
          // Log notifications on specific steps
          if (newStatus === 'Delivered') {
            // Check settings or add loyalty points to customer
            await addLoyaltyPointsForOrder(oId);
          }
        } catch (err) {
          console.error("Order status update fail:", err);
          showToast("Failed to update status", true);
        }
      });
    });

    tbody.querySelectorAll('.order-details-trigger').forEach(btn => {
      btn.addEventListener('click', () => openOrderDetailModal(btn.getAttribute('data-id')));
    });

  } catch (err) {
    console.error("Orders list fetch fail:", err);
  }
}

async function addLoyaltyPointsForOrder(orderId) {
  try {
    const oSnap = await getDoc(doc(db, "orders", orderId));
    if (oSnap.exists()) {
      const order = oSnap.data();
      const clientEmail = order.customer.email;
      
      const cQuery = query(collection(db, "customers"), where("email", "==", clientEmail));
      const cSnap = await getDocs(cQuery);
      if (!cSnap.empty) {
        const cDoc = cSnap.docs[0];
        const pointsAwarded = Math.floor(order.totalAmount / 10); // 10 points per $10 spent
        const currentPoints = cDoc.data().loyaltyPoints || 0;
        await updateDoc(doc(db, "customers", cDoc.id), {
          loyaltyPoints: currentPoints + pointsAwarded
        });
        showToast(`Awarded ${pointsAwarded} loyalty points to customer!`);
      }
    }
  } catch (err) {
    console.error("Loyalty points update failed:", err);
  }
}

// --------------------------------------------------
// ORDER DETAIL MODAL & RETURN PROCESSING
// --------------------------------------------------

async function openOrderDetailModal(orderId) {
  const modal = document.getElementById('orderDetailModal');
  const container = document.getElementById('modalOrderContent');
  if (!modal || !container) return;

  try {
    const oSnap = await getDoc(doc(db, "orders", orderId));
    if (!oSnap.exists()) {
      showToast("Order document details missing", true);
      return;
    }

    const order = oSnap.data();
    document.getElementById('modalOrderRef').textContent = `Order Detail #${orderId.slice(0,10)}`;

    let itemsHtml = '';
    order.items.forEach(item => {
      itemsHtml += `
        <tr style="border-bottom:1px solid var(--border-color);">
          <td><img src="${item.imageUrl || '../images/placeholder.png'}" style="width:30px; height:40px; object-fit:cover; border-radius:2px;"></td>
          <td>
            <div style="font-weight:500;">${item.name}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Size: ${item.size || 'N/A'} | Color: ${item.color || 'N/A'}</div>
          </td>
          <td>${getActiveCurrency()}${parseFloat(item.price).toFixed(2)}</td>
          <td>${item.quantity}</td>
          <td style="font-weight:600;">${getActiveCurrency()}${(parseFloat(item.price) * parseInt(item.quantity)).toFixed(2)}</td>
        </tr>
      `;
    });

    let returnRequestHtml = '';
    if (order.returnRequest) {
      const rr = order.returnRequest;
      returnRequestHtml = `
        <div style="margin-top: 1.5rem; padding: 1rem; border-radius: 8px; background: #FFF3E0; border: 1px solid #FFE0B2;">
          <h4 style="color:#E65100; margin-bottom: 0.25rem;">Return / Exchange Request</h4>
          <div>Type: <strong>${rr.type}</strong> | Status: <strong>${rr.status}</strong></div>
          <div style="font-size:0.9rem; margin: 4px 0;">Reason: "${rr.reason}"</div>
          ${rr.type === 'Exchange' ? `<div style="font-size:0.9rem;">Target size/color: <strong>${rr.targetVariant}</strong></div>` : ''}
          
          ${rr.status === 'Pending' ? `
            <div style="margin-top:0.75rem; display:flex; gap:0.5rem;">
              <button class="btn btn-primary approve-request-btn" style="padding:4px 10px; font-size:0.8rem; background:var(--success-color); border-color:var(--success-color);" data-id="${orderId}">Approve Request</button>
              <button class="btn btn-secondary reject-request-btn" style="padding:4px 10px; font-size:0.8rem; background:var(--error-color); color:#fff; border-color:var(--error-color);" data-id="${orderId}">Reject Request</button>
            </div>
          ` : ''}
        </div>
      `;
    }

    container.innerHTML = `
      <div class="form-row-2">
        <div>
          <h4 style="margin-bottom:0.5rem; color:var(--accent-color);">Customer Profile Details</h4>
          <div>Name: <strong>${order.customer.firstName} ${order.customer.lastName}</strong></div>
          <div>Email: ${order.customer.email}</div>
          <div>Phone: ${order.customer.phone || 'N/A'}</div>
          <div>Address: ${order.customer.address}, ${order.customer.city || ''}</div>
        </div>
        <div>
          <h4 style="margin-bottom:0.5rem; color:var(--accent-color);">Payment & Dispatch Courier</h4>
          <div>Payment method: <strong>${order.paymentMethod || 'COD'}</strong></div>
          <div>Payment status: <span class="status-pill status-${order.paymentStatus === 'Paid' ? 'delivered' : 'pending'}">${order.paymentStatus}</span></div>
          
          <div style="margin-top:1rem;">
            <label style="font-weight:500; font-size:0.85rem;">Assign Courier & Tracking:</label>
            <div style="display:flex; gap:0.25rem; margin-top:4px;">
              <select id="modalCourierSelect" class="form-control" style="padding: 4px; width:130px; margin-bottom:0;">
                <option value="DHL Express" ${order.courier === 'DHL Express' ? 'selected' : ''}>DHL Express</option>
                <option value="FedEx" ${order.courier === 'FedEx' ? 'selected' : ''}>FedEx</option>
                <option value="USPS" ${order.courier === 'USPS' ? 'selected' : ''}>USPS</option>
                <option value="UPS" ${order.courier === 'UPS' ? 'selected' : ''}>UPS</option>
                <option value="Local Courier" ${order.courier === 'Local Courier' ? 'selected' : ''}>Local Courier</option>
              </select>
              <input type="text" id="modalTrackingInput" class="form-control" style="padding: 4px; margin-bottom:0;" placeholder="Tracking #" value="${order.trackingNumber || ''}">
            </div>
            <button class="btn btn-primary save-shipping-info-btn" data-id="${orderId}" style="margin-top:0.5rem; width:100%; padding:6px 12px; font-size:0.8rem;">Save Dispatch Track</button>
          </div>
        </div>
      </div>

      <h4 style="margin: 1.5rem 0 0.5rem 0; border-bottom: 1px solid var(--border-color); padding-bottom: 0.25rem;">Ordered items</h4>
      <table style="width:100%; font-size: 0.9rem;">
        <thead>
          <tr style="text-align:left;">
            <th>Image</th>
            <th>Item details</th>
            <th>Price</th>
            <th>Qty</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div style="display:flex; justify-content:flex-end; margin-top:1.5rem;">
        <div style="width:250px; text-align:right; display:flex; flex-direction:column; gap:4px;">
          <div>Subtotal: <strong>${getActiveCurrency()}${parseFloat(order.subtotal || 0).toFixed(2)}</strong></div>
          <div>Shipping cost: <strong>${getActiveCurrency()}${parseFloat(order.shipping || 0).toFixed(2)}</strong></div>
          <div style="font-size:1.15rem; font-weight:700;">Grand Total: ${getActiveCurrency()}${parseFloat(order.totalAmount).toFixed(2)}</div>
        </div>
      </div>

      ${returnRequestHtml}

      <div style="margin-top:2rem; display:flex; gap:1rem; border-top:1px solid var(--border-color); padding-top:1rem;">
        <button class="btn btn-accent print-invoice-btn" data-id="${orderId}" style="flex-grow:1;">Print Invoice Receipt</button>
        <button class="btn btn-secondary close-modal-btn" style="flex-grow:1;">Close Drawer</button>
      </div>
    `;

    // Attach listeners
    container.querySelector('.close-modal-btn').addEventListener('click', () => modal.classList.remove('active'));
    
    // Save shipping listener
    container.querySelector('.save-shipping-info-btn').addEventListener('click', async () => {
      const courier = document.getElementById('modalCourierSelect').value;
      const trackingNumber = document.getElementById('modalTrackingInput').value.trim();
      await updateDoc(doc(db, "orders", orderId), { courier, trackingNumber });
      showToast("Shipping tracks saved successfully!");
      loadOrdersList();
    });

    // Invoice print listener
    container.querySelector('.print-invoice-btn').addEventListener('click', () => triggerInvoicePrint(orderId, order));

    // Return approves listener
    const approveBtn = container.querySelector('.approve-request-btn');
    if (approveBtn) {
      approveBtn.addEventListener('click', () => handleApproveReturnExchange(orderId, order.returnRequest));
    }
    const rejectBtn = container.querySelector('.reject-request-btn');
    if (rejectBtn) {
      rejectBtn.addEventListener('click', () => handleRejectReturnExchange(orderId));
    }

    modal.classList.add('active');

  } catch (err) {
    console.error("Order details loading fail:", err);
  }
}

async function handleApproveReturnExchange(orderId, request) {
  try {
    // 1. Update order status and returnRequest status
    await updateDoc(doc(db, "orders", orderId), {
      orderStatus: request.type === 'Return' ? 'Returned' : 'Confirmed',
      paymentStatus: request.type === 'Return' ? 'Refunded' : 'Paid',
      "returnRequest.status": "Approved"
    });

    // 2. Increment stock back if it's a simple refund return
    if (request.type === 'Return') {
      // Loop over items and put back stock
      const snap = await getDoc(doc(db, "orders", orderId));
      const order = snap.data();
      for (const item of order.items) {
        const prodRef = doc(db, "products", item.id);
        const pSnap = await getDoc(prodRef);
        if (pSnap.exists()) {
          const product = pSnap.data();
          if (product.variants && product.variants.length > 0) {
            const updatedVariants = product.variants.map(v => {
              if (v.size === item.size && v.color === item.color) {
                return { ...v, stock: parseInt(v.stock) + parseInt(item.quantity) };
              }
              return v;
            });
            await updateDoc(prodRef, {
              variants: updatedVariants,
              stock: parseInt(product.stock) + parseInt(item.quantity)
            });
          } else {
            await updateDoc(prodRef, {
              stock: parseInt(product.stock) + parseInt(item.quantity)
            });
          }

          // Write adjustment log
          await addDoc(collection(db, "stock_history"), {
            productId: item.id,
            productName: product.name,
            size: item.size || 'N/A',
            color: item.color || 'N/A',
            quantity: item.quantity,
            type: "RESTOCK",
            operator: "Return Approval",
            createdAt: new Date()
          });
        }
      }
    }

    showToast(`Return request approved. Order updated.`);
    document.getElementById('orderDetailModal').classList.remove('active');
    loadOrdersList();

  } catch (err) {
    console.error("Approve return request failed:", err);
  }
}

async function handleRejectReturnExchange(orderId) {
  try {
    await updateDoc(doc(db, "orders", orderId), {
      "returnRequest.status": "Rejected"
    });
    showToast("Return request rejected");
    document.getElementById('orderDetailModal').classList.remove('active');
    loadOrdersList();
  } catch (err) {
    console.error("Reject return request failed:", err);
  }
}

function triggerInvoicePrint(orderId, order) {
  const printBox = document.getElementById('invoicePrintContainer');
  if (!printBox) return;

  const date = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
  const dateStr = date.toLocaleDateString();

  let itemsRows = '';
  order.items.forEach(item => {
    itemsRows += `
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:6px 0;">${item.name} (${item.size || 'N/A'}/${item.color || 'N/A'})</td>
        <td style="text-align:center;">${getActiveCurrency()}${parseFloat(item.price).toFixed(2)}</td>
        <td style="text-align:center;">${item.quantity}</td>
        <td style="text-align:right; font-weight:600;">${getActiveCurrency()}${(parseFloat(item.price) * parseInt(item.quantity)).toFixed(2)}</td>
      </tr>
    `;
  });

  printBox.innerHTML = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="margin: 0; color:#1A1A1A; text-transform:uppercase; letter-spacing:1px;">Anjiana Store NY</h2>
        <p style="margin: 4px 0; font-size: 0.85rem; color: #777;">5th Avenue High Street, Manhattan, NY | info@anjiana.com</p>
        <p style="margin: 2px 0; font-size: 0.85rem; color: #777;">Phone: +1 (555) 987-6543</p>
      </div>
      
      <div style="border-top: 1px dashed #ccc; border-bottom: 1px dashed #ccc; padding: 10px 0; margin-bottom: 20px; font-size:0.9rem;">
        <div>Order Reference ID: <strong>#${orderId}</strong></div>
        <div>Date: ${dateStr}</div>
        <div>Customer Name: <strong>${order.customer.firstName} ${order.customer.lastName}</strong></div>
        <div>Payment method: ${order.paymentMethod || 'COD'}</div>
      </div>
      
      <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-bottom: 20px;">
        <thead>
          <tr style="border-bottom: 2px solid #333; text-align: left;">
            <th style="padding:6px 0;">Item Details</th>
            <th style="text-align:center;">Price</th>
            <th style="text-align:center;">Qty</th>
            <th style="text-align:right;">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>
      
      <div style="text-align: right; font-size: 0.95rem; line-height: 1.6;">
        <div>Subtotal: ${getActiveCurrency()}${parseFloat(order.subtotal).toFixed(2)}</div>
        <div>Shipping Fee: ${getActiveCurrency()}${parseFloat(order.shipping).toFixed(2)}</div>
        <div style="font-size: 1.25rem; font-weight: 700; margin-top: 6px; border-top: 2px solid #333; padding-top: 6px;">Total Amount: ${getActiveCurrency()}${parseFloat(order.totalAmount).toFixed(2)}</div>
      </div>
      
      <div style="text-align: center; margin-top: 40px; font-size: 0.8rem; color: #999;">
        Thank you for shopping at Anjiana Store!<br>
        For return and exchange queries, contact returns@anjiana.com
      </div>
    </div>
  `;

  // Display container temporarily for printing, then hide
  printBox.style.display = 'block';
  window.print();
  printBox.style.display = 'none';
}

// --------------------------------------------------
// 7. CUSTOMER MANAGEMENT
// --------------------------------------------------

async function loadCustomersList() {
  const tbody = document.getElementById('customersTableBody');
  if (!tbody) return;

  try {
    const qSnap = await getDocs(collection(db, "customers"));
    tbody.innerHTML = '';

    if (qSnap.empty) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">No registered customers in database.</td></tr>`;
      return;
    }

    qSnap.forEach(docSnap => {
      const cust = docSnap.data();
      const id = docSnap.id;
      
      const date = cust.createdAt?.toDate ? cust.createdAt.toDate() : new Date(cust.createdAt || Date.now());
      const dateStr = date.toLocaleDateString();

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 600;">${cust.name}</td>
        <td>${cust.email}</td>
        <td>${cust.phone || 'N/A'}</td>
        <td style="font-weight: 600; color: var(--accent-color);">${cust.loyaltyPoints || 0} pts</td>
        <td><span class="status-pill status-${cust.status === 'Active' ? 'delivered' : 'cancelled'}">${cust.status}</span></td>
        <td>${dateStr}</td>
        <td>
          <button class="btn btn-secondary view-customer-details-btn" data-id="${id}" style="padding: 4px 8px; font-size: 0.8rem;">Profile Details</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.view-customer-details-btn').forEach(btn => {
      btn.addEventListener('click', () => openCustomerDetailModal(btn.getAttribute('data-id')));
    });

  } catch (err) {
    console.error("Customers list fetch failure:", err);
  }
}

async function openCustomerDetailModal(customerId) {
  const modal = document.getElementById('customerDetailModal');
  const container = document.getElementById('modalCustomerContent');
  if (!modal || !container) return;

  try {
    const cSnap = await getDoc(doc(db, "customers", customerId));
    if (!cSnap.exists()) return;
    const cust = cSnap.data();

    document.getElementById('modalCustomerName').textContent = `Customer Profile: ${cust.name}`;

    // Get order history of this customer
    const oQuery = query(collection(db, "orders"), where("customer.email", "==", cust.email));
    const oSnap = await getDocs(oQuery);
    
    let orderHistoryRows = '';
    oSnap.forEach(oDoc => {
      const order = oDoc.data();
      const orderId = oDoc.id;
      const date = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
      orderHistoryRows += `
        <tr style="border-bottom:1px solid var(--border-color);">
          <td style="font-family:monospace;">#${orderId.slice(0,8)}</td>
          <td>${date.toLocaleDateString()}</td>
          <td style="font-weight:600;">${getActiveCurrency()}${parseFloat(order.totalAmount).toFixed(2)}</td>
          <td><span class="status-pill status-${order.orderStatus.toLowerCase()}" style="font-size:0.75rem; padding:2px 6px;">${order.orderStatus}</span></td>
        </tr>
      `;
    });

    if (orderHistoryRows === '') {
      orderHistoryRows = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No orders logged.</td></tr>`;
    }

    container.innerHTML = `
      <div class="form-row-2">
        <div>
          <h4 style="margin-bottom:0.5rem; color:var(--accent-color);">Profile Information</h4>
          <div>Email: <strong>${cust.email}</strong></div>
          <div>Phone: ${cust.phone || 'N/A'}</div>
          <div>Addresses saved: ${cust.addresses ? cust.addresses.join(' | ') : 'None'}</div>
          
          <div style="margin-top:1.5rem; display:flex; gap:1rem; align-items:center;">
            <div>Loyalty Points: <strong style="color:var(--accent-color); font-size:1.25rem;">${cust.loyaltyPoints || 0} pts</strong></div>
            <div style="display:flex; gap:0.25rem;">
              <input type="number" id="adjustPointsInput" class="form-control" style="width:70px; margin-bottom:0; padding:4px;" value="10">
              <button class="btn btn-secondary adjust-points-btn" style="padding:4px 8px; font-size:0.8rem;">Add Pts</button>
            </div>
          </div>
        </div>
        <div>
          <h4 style="margin-bottom:0.5rem; color:var(--accent-color);">Account Operations</h4>
          <div>Status: <span class="status-pill status-${cust.status === 'Active' ? 'delivered' : 'cancelled'}">${cust.status}</span></div>
          <button class="btn toggle-cust-status-btn" style="margin-top:1rem; width:100%; padding:6px 12px; font-size:0.8rem; background:${cust.status === 'Active' ? 'var(--error-color)' : 'var(--success-color)'}; color:white; border:none;">
            ${cust.status === 'Active' ? 'Suspend Account' : 'Activate Account'}
          </button>
        </div>
      </div>

      <h4 style="margin: 2rem 0 0.5rem 0; border-bottom: 1px solid var(--border-color); padding-bottom: 0.25rem;">Purchase History Log</h4>
      <table style="width:100%; font-size:0.85rem;">
        <thead>
          <tr style="text-align:left;">
            <th>Order Ref</th>
            <th>Date</th>
            <th>Total Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${orderHistoryRows}
        </tbody>
      </table>

      <div style="margin-top:2rem; display:flex; justify-content:flex-end; border-top:1px solid var(--border-color); padding-top:1rem;">
        <button class="btn btn-secondary close-modal-btn" style="width:150px;">Close Drawer</button>
      </div>
    `;

    // Attach listeners
    container.querySelector('.close-modal-btn').addEventListener('click', () => modal.classList.remove('active'));
    
    // Adjust points listener
    container.querySelector('.adjust-points-btn').addEventListener('click', async () => {
      const addedPoints = parseInt(document.getElementById('adjustPointsInput').value) || 0;
      await updateDoc(doc(db, "customers", customerId), {
        loyaltyPoints: (cust.loyaltyPoints || 0) + addedPoints
      });
      showToast("Loyalty points updated!");
      openCustomerDetailModal(customerId); // refresh
      loadCustomersList();
    });

    // Toggle status listener
    container.querySelector('.toggle-cust-status-btn').addEventListener('click', async () => {
      const nextStatus = cust.status === 'Active' ? 'Suspended' : 'Active';
      await updateDoc(doc(db, "customers", customerId), { status: nextStatus });
      showToast(`Customer account set to ${nextStatus}`);
      openCustomerDetailModal(customerId); // refresh
      loadCustomersList();
    });

    modal.classList.add('active');

  } catch (err) {
    console.error("Open customer details failure:", err);
  }
}

// --------------------------------------------------
// 8. PAYMENTS & REFUNDS TRANS LEDGER
// --------------------------------------------------

async function loadPaymentsLedger() {
  const tbody = document.getElementById('paymentsTableBody');
  if (!tbody) return;

  try {
    const qSnap = await getDocs(collection(db, "orders"));
    tbody.innerHTML = '';

    let grossPaid = 0;
    let refundedSum = 0;
    let counter = 0;

    const setCurrency = getActiveCurrency();

    qSnap.forEach(oDoc => {
      const ord = oDoc.data();
      const oId = oDoc.id;

      if (ord.paymentStatus === 'Paid') {
        grossPaid += parseFloat(ord.totalAmount || 0);
      } else if (ord.paymentStatus === 'Refunded') {
        refundedSum += parseFloat(ord.totalAmount || 0);
      }

      const date = ord.createdAt?.toDate ? ord.createdAt.toDate() : new Date(ord.createdAt);
      const dateStr = date.toLocaleDateString();

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family:monospace; font-size:0.85rem;">#${oId.slice(0,8)}</td>
        <td style="font-family:monospace; font-size:0.8rem; color:var(--text-muted);">${ord.transactionId || `TR-${oId.slice(0,6).toUpperCase()}`}</td>
        <td style="font-size:0.85rem;">${ord.paymentMethod || 'COD'}</td>
        <td style="font-weight:600;">${setCurrency}${parseFloat(ord.totalAmount).toFixed(2)}</td>
        <td style="font-size:0.85rem;">${dateStr}</td>
        <td><span class="status-pill status-${ord.paymentStatus === 'Paid' ? 'delivered' : ord.paymentStatus === 'Refunded' ? 'returned' : 'pending'}">${ord.paymentStatus}</span></td>
        <td>
          ${ord.paymentStatus === 'Paid' ? `<button class="btn process-refund-btn" style="padding:4px 8px; font-size:0.80rem; background:#FFEBEE; color:#C62828; border:none;" data-id="${oId}">Refund</button>` : `<span style="font-size:0.8rem; color:var(--text-muted);">Settled</span>`}
        </td>
      `;
      tbody.appendChild(tr);
      counter++;
    });

    if (counter === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">No transactions found.</td></tr>`;
    }

    // Populate counts
    document.getElementById('paymentsPaidSum').textContent = `${setCurrency}${grossPaid.toFixed(2)}`;
    document.getElementById('paymentsRefundedSum').textContent = `${setCurrency}${refundedSum.toFixed(2)}`;
    document.getElementById('paymentsNetSum').textContent = `${setCurrency}${(grossPaid - refundedSum).toFixed(2)}`;

    // Attach refund triggers
    tbody.querySelectorAll('.process-refund-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm("Proceed with processing refund? This sets payment status to Refunded and order status to Returned.")) {
          await updateDoc(doc(db, "orders", id), {
            paymentStatus: "Refunded",
            orderStatus: "Returned"
          });
          showToast("Refund transaction processed successfully.");
          loadPaymentsLedger();
        }
      });
    });

  } catch (err) {
    console.error("Ledger fetching failure:", err);
  }
}

// --------------------------------------------------
// 9. SHIPPING DISPATCH MANAGEMENT
// --------------------------------------------------

async function loadShippingView() {
  const tbody = document.getElementById('shippingTableBody');
  if (!tbody) return;

  // Fetch and populate shipping rules
  try {
    const sSnap = await getDoc(doc(db, "settings", "shipping_rules"));
    if (sSnap.exists()) {
      const rules = sSnap.data();
      if (document.getElementById('shipStandardFee')) {
        document.getElementById('shipStandardFee').value = rules.standardFee !== undefined ? rules.standardFee : 10.00;
      }
      if (document.getElementById('shipExpressFee')) {
        document.getElementById('shipExpressFee').value = rules.expressFee !== undefined ? rules.expressFee : 25.00;
      }
      if (document.getElementById('shipFreeThreshold')) {
        document.getElementById('shipFreeThreshold').value = rules.freeShippingThreshold !== undefined ? rules.freeShippingThreshold : 150.00;
      }
      if (document.getElementById('shipCouriers')) {
        document.getElementById('shipCouriers').value = rules.couriers ? rules.couriers.join(', ') : 'FedEx, DHL Express, USPS, UPS, Local Logistics';
      }
    }
  } catch (err) {
    console.error("Error loading shipping rules settings:", err);
  }

  try {
    const qSnap = await getDocs(collection(db, "orders"));
    tbody.innerHTML = '';

    let counter = 0;
    qSnap.forEach(oDoc => {
      const ord = oDoc.data();
      const oId = oDoc.id;

      // Filter out Cancelled
      if (ord.orderStatus === 'Cancelled') return;

      const addressStr = `${ord.customer.address}, ${ord.customer.city || ''}`;
      const courierStr = ord.courier || 'Unassigned';
      const trackingStr = ord.trackingNumber || 'N/A';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family:monospace; font-size:0.85rem;">#${oId.slice(0,8)}</td>
        <td style="font-size:0.85rem; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${addressStr}</td>
        <td style="font-weight:500; font-size:0.85rem;">${courierStr}</td>
        <td style="font-family:monospace; font-size:0.8rem; color:var(--text-muted);">${trackingStr}</td>
        <td><span class="status-pill status-${ord.orderStatus.toLowerCase()}">${ord.orderStatus}</span></td>
        <td>
          <button class="btn btn-secondary ship-dispatch-btn" data-id="${oId}" style="padding:4px 8px; font-size:0.8rem;">Dispatch Courier</button>
        </td>
      `;
      tbody.appendChild(tr);
      counter++;
    });

    if (counter === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center;">No shipments currently processing.</td></tr>`;
    }

    tbody.querySelectorAll('.ship-dispatch-btn').forEach(btn => {
      btn.addEventListener('click', () => openOrderDetailModal(btn.getAttribute('data-id')));
    });

  } catch (err) {
    console.error("Shipping dispatch tracking error:", err);
  }
}

// --------------------------------------------------
// 10. DISCOUNTS & BANNER MANAGER
// --------------------------------------------------

async function loadDiscountsView() {
  const couponsTbody = document.getElementById('couponsTableBody');
  const bannerContainer = document.getElementById('bannersContainer');
  if (!couponsTbody || !bannerContainer) return;

  try {
    // A. Fetch coupons
    const cSnap = await getDocs(collection(db, "coupons"));
    couponsTbody.innerHTML = '';
    
    let cCount = 0;
    cSnap.forEach(docSnap => {
      const coup = docSnap.data();
      const id = docSnap.id;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:700; color:var(--accent-color);">${coup.code}</td>
        <td>${coup.type}</td>
        <td>${coup.type === 'Percentage' ? `${coup.value}%` : coup.type === 'Fixed' ? `${getActiveCurrency()}${coup.value}` : 'B2G1'}</td>
        <td style="font-size:0.8rem;">${coup.expiry || 'No Expiry'}</td>
        <td><span class="status-pill status-${coup.status === 'Active' ? 'delivered' : 'cancelled'}">${coup.status}</span></td>
        <td>
          <button class="btn delete-coupon-btn" data-id="${id}" style="padding: 2px 6px; font-size: 0.75rem; background: #FFEBEE; color: #C62828;">Delete</button>
        </td>
      `;
      couponsTbody.appendChild(tr);
      cCount++;
    });

    if (cCount === 0) {
      couponsTbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No coupons registered.</td></tr>`;
    }

    couponsTbody.querySelectorAll('.delete-coupon-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm("Delete this coupon?")) {
          await deleteDoc(doc(db, "coupons", id));
          showToast("Coupon deleted successfully");
          loadDiscountsView();
        }
      });
    });

    // B. Fetch Banners
    const bSnap = await getDocs(collection(db, "banners"));
    bannerContainer.innerHTML = '';
    
    let bCount = 0;
    bSnap.forEach(docSnap => {
      const ban = docSnap.data();
      const id = docSnap.id;

      const div = document.createElement('div');
      div.style.display = 'flex';
      div.style.alignItems = 'center';
      div.style.justifyContent = 'space-between';
      div.style.border = '1px solid var(--border-color)';
      div.style.borderRadius = '6px';
      div.style.padding = '8px';
      div.style.marginBottom = '8px';
      div.innerHTML = `
        <div style="display:flex; gap:10px; align-items:center;">
          <img src="${ban.imageUrl}" style="width:40px; height:40px; object-fit:cover; border-radius:4px;">
          <div>
            <div style="font-weight:600; font-size:0.85rem;">${ban.title}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">${ban.type} -> ${ban.link || '#'}</div>
          </div>
        </div>
        <button class="btn delete-banner-btn" data-id="${id}" style="padding:4px 8px; font-size:0.75rem; background:#FFEBEE; color:#C62828; border:none;">Remove</button>
      `;
      bannerContainer.appendChild(div);
      bCount++;
    });

    if (bCount === 0) {
      bannerContainer.innerHTML = `<div class="text-muted" style="text-align:center; padding:1.5rem 0;">No active homepage banner components.</div>`;
    }

    bannerContainer.querySelectorAll('.delete-banner-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        await deleteDoc(doc(db, "banners", id));
        showToast("Homepage banner campaign removed.");
        loadDiscountsView();
      });
    });

  } catch (err) {
    console.error("Discounts fetching failure:", err);
  }
}

// --------------------------------------------------
// 11. REVIEWS APPROVAL & REPLY MODULE
// --------------------------------------------------

async function loadReviewsList() {
  const tbody = document.getElementById('reviewsTableBody');
  if (!tbody) return;

  try {
    const qSnap = await getDocs(collection(db, "reviews"));
    tbody.innerHTML = '';

    let counter = 0;
    qSnap.forEach(docSnap => {
      const rev = docSnap.data();
      const id = docSnap.id;

      const stars = '⭐'.repeat(rev.rating);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 500; font-size:0.85rem;">${rev.productName}</td>
        <td style="font-size:0.85rem;">${rev.customerName}</td>
        <td>${stars}</td>
        <td style="font-size: 0.85rem; max-width: 200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${rev.comment}">"${rev.comment}"</td>
        <td>
          <button class="btn btn-secondary approve-review-toggle-btn" data-id="${id}" data-status="${rev.status}" style="padding:4px 8px; font-size:0.8rem; background:${rev.status === 'Approved' ? '#E8F5E9' : '#FFF3E0'}; color:${rev.status === 'Approved' ? '#2E7D32' : '#E65100'}; border:none;">
            ${rev.status}
          </button>
        </td>
        <td style="font-size:0.8rem; color:var(--text-muted);">${rev.reply ? `<em>${rev.reply}</em>` : 'No reply'}</td>
        <td>
          <button class="btn btn-secondary reply-review-trigger" data-id="${id}" data-text="${rev.comment}" style="padding: 4px 8px; font-size: 0.80rem; margin-right: 4px;">Reply</button>
          <button class="btn delete-review-btn" data-id="${id}" style="padding: 4px 8px; font-size: 0.80rem; background:#FFEBEE; color:#C62828; border:none;">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
      counter++;
    });

    if (counter === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">No customer reviews loaded yet.</td></tr>`;
    }

    // Toggle Approval status listeners
    tbody.querySelectorAll('.approve-review-toggle-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const currentStatus = btn.getAttribute('data-status');
        const newStatus = currentStatus === 'Approved' ? 'Pending' : 'Approved';
        await updateDoc(doc(db, "reviews", id), { status: newStatus });
        showToast(`Review set to ${newStatus}`);
        loadReviewsList();
      });
    });

    // Delete review listeners
    tbody.querySelectorAll('.delete-review-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm("Delete this review?")) {
          await deleteDoc(doc(db, "reviews", id));
          showToast("Review deleted");
          loadReviewsList();
        }
      });
    });

    // Open Reply triggers
    tbody.querySelectorAll('.reply-review-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const comment = btn.getAttribute('data-text');

        document.getElementById('replyReviewId').value = id;
        document.getElementById('reviewTextPreview').textContent = `"${comment}"`;
        document.getElementById('replyTextInput').value = '';

        document.getElementById('replyModal').classList.add('active');
      });
    });

  } catch (err) {
    console.error("Reviews fetching failure:", err);
  }
}

// --------------------------------------------------
// 12. DETAILED REPORTS & ANALYTICS VIEWS
// --------------------------------------------------

async function loadReportsView() {
  const chartScope = document.getElementById('reportScope').value;
  const ctx = document.getElementById('reportsDetailedChart');
  if (!ctx) return;

  try {
    const ordersSnap = await getDocs(collection(db, "orders"));
    const productsSnap = await getDocs(collection(db, "products"));
    const customersSnap = await getDocs(collection(db, "customers"));

    const salesTimeline = {};
    let stockValuationSum = 0;
    let totalOrderCount = 0;
    let returnedOrderCount = 0;
    let exchangedOrderCount = 0;

    ordersSnap.forEach(oDoc => {
      const order = oDoc.data();
      totalOrderCount++;

      if (order.orderStatus === 'Returned') returnedOrderCount++;
      if (order.returnRequest && order.returnRequest.type === 'Exchange') exchangedOrderCount++;

      if (order.createdAt) {
        const date = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
        
        let label = '';
        if (chartScope === 'Monthly') {
          label = date.toLocaleString('default', { month: 'short', year: 'numeric' });
        } else if (chartScope === 'Weekly') {
          // Get week number
          const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
          const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
          const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
          label = `Wk ${weekNum} (${date.getFullYear()})`;
        } else { // Daily
          label = date.toLocaleDateString();
        }

        salesTimeline[label] = (salesTimeline[label] || 0) + parseFloat(order.totalAmount || 0);
      }
    });

    productsSnap.forEach(pDoc => {
      const prod = pDoc.data();
      // Multiply current stock by price
      stockValuationSum += (parseInt(prod.stock || 0) * parseFloat(prod.price || 0));
    });

    // Populate analytical sums
    const setCurrency = getActiveCurrency();
    document.getElementById('analyticsStockValue').textContent = `${setCurrency}${stockValuationSum.toFixed(2)}`;

    const returnRate = totalOrderCount > 0 ? ((returnedOrderCount / totalOrderCount) * 100) : 0;
    document.getElementById('analyticsReturnRate').textContent = `${returnRate.toFixed(1)}%`;

    const exchangeRate = totalOrderCount > 0 ? ((exchangedOrderCount / totalOrderCount) * 100) : 0;
    document.getElementById('analyticsExchangeRate').textContent = `${exchangeRate.toFixed(1)}%`;

    document.getElementById('analyticsCustomerGrowth').textContent = `+${customersSnap.size}`;

    // Load Top Viewed items
    loadTopViewedProducts(productsSnap);

    // Draw Detailed reports chart
    if (detailedChartInstance) {
      detailedChartInstance.destroy();
    }

    const labels = Object.keys(salesTimeline);
    const data = Object.values(salesTimeline);

    detailedChartInstance = new Chart(ctx, {
      type: chartScope === 'Daily' ? 'bar' : 'line',
      data: {
        labels: labels,
        datasets: [{
          label: `${chartScope} Analytics Revenue (${setCurrency})`,
          data: data,
          borderColor: '#2196F3',
          backgroundColor: chartScope === 'Daily' ? 'rgba(33, 150, 243, 0.4)' : 'rgba(33, 150, 243, 0.08)',
          fill: true,
          tension: 0.25,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true },
          x: { grid: { display: false } }
        }
      }
    });

  } catch (err) {
    console.error("Reports loading failure:", err);
  }
}

function loadTopViewedProducts(productsSnap) {
  const container = document.getElementById('topViewedContainer');
  if (!container) return;
  container.innerHTML = '';

  const list = [];
  productsSnap.forEach(pDoc => {
    const data = pDoc.data();
    list.push({ name: data.name, views: data.views || 0 });
  });

  // Sort by views descending
  list.sort((a,b) => b.views - a.views);

  const displayList = list.slice(0, 5);
  if (displayList.length === 0) {
    container.innerHTML = `<div class="text-muted">No viewing log data.</div>`;
    return;
  }

  const ul = document.createElement('ul');
  ul.style.display = 'flex';
  ul.style.flexDirection = 'column';
  ul.style.gap = '8px';
  ul.style.padding = '0';

  displayList.forEach(item => {
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    li.style.alignItems = 'center';
    li.style.borderBottom = '1px solid var(--border-color)';
    li.style.paddingBottom = '6px';
    li.innerHTML = `
      <span style="font-size:0.9rem; font-weight:500;">${item.name}</span>
      <span style="font-size:0.8rem; color:var(--text-muted); font-weight:500;">👁️ ${item.views} views</span>
    `;
    ul.appendChild(li);
  });

  container.appendChild(ul);
}

// --------------------------------------------------
// 13. STAFF MANAGEMENT MODULES
// --------------------------------------------------

async function loadStaffView() {
  const tbody = document.getElementById('staffTableBody');
  const logsTbody = document.getElementById('staffHistoryTableBody');
  if (!tbody) return;

  try {
    const isUserAdmin = currentUserRole === 'Admin';

    // A. Staff list
    const qSnap = await getDocs(collection(db, "staff"));
    tbody.innerHTML = '';

    const loggedInEmail = auth.currentUser ? auth.currentUser.email : (sessionStorage.getItem('staffUserEmail') || 'admin@anjiana.com');

    qSnap.forEach(sDoc => {
      const staff = sDoc.data();
      const id = sDoc.id;

      // Filter: non-admin staff can only see their own roster details
      if (!isUserAdmin && staff.email.toLowerCase().trim() !== loggedInEmail.toLowerCase().trim()) {
        return;
      }

      const statusVal = staff.status || 'Approved';
      const statusClass = statusVal === 'Approved' ? 'delivered' : statusVal === 'Pending' ? 'pending' : 'cancelled';

      const isSelfAdmin = staff.email.toLowerCase().trim() === 'admin@anjiana.com';
      let toggleStatusBtnHTML = '';
      if (isUserAdmin && !isSelfAdmin) {
        if (statusVal === 'Approved') {
          toggleStatusBtnHTML = `<button class="btn deny-staff-btn" data-id="${id}" style="padding:4px 8px; font-size:0.75rem; background:#FFEBEE; color:#C62828; border:none; margin-right:4px;">Deny</button>`;
        } else {
          toggleStatusBtnHTML = `<button class="btn approve-staff-btn" data-id="${id}" style="padding:4px 8px; font-size:0.75rem; background:#E8F5E9; color:#2E7D32; border:none; margin-right:4px;">Approve</button>`;
        }
      }

      const actionsHTML = isUserAdmin 
        ? `
          ${toggleStatusBtnHTML}
          <button class="btn edit-staff-btn" data-id="${id}" style="padding:4px 8px; font-size:0.75rem; background:rgba(212,175,55,0.15); color:var(--accent-color); border:none; margin-right:4px;">Edit</button>
          ${isSelfAdmin ? '' : `<button class="btn delete-staff-btn" data-id="${id}" style="padding:4px 8px; font-size:0.75rem; background:#FFEBEE; color:#C62828; border:none;">Remove</button>`}
        `
        : `<span class="text-muted" style="font-size:0.8rem;">🔒 View Only</span>`;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:600;">${staff.name}</td>
        <td>${staff.email}</td>
        <td><span class="status-pill status-${staff.role === 'Admin' ? 'delivered' : staff.role === 'Manager' ? 'processing' : 'returned'}">${staff.role}</span></td>
        <td><span class="status-pill status-${statusClass}">${statusVal}</span></td>
        <td>${actionsHTML}</td>
      `;
      tbody.appendChild(tr);
    });

    if (isUserAdmin) {
      // Attach approve listeners
      tbody.querySelectorAll('.approve-staff-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          await updateDoc(doc(db, "staff", id), { status: "Approved" });
          showToast("Staff access approved.");
          loadStaffView();
        });
      });

      // Attach deny listeners
      tbody.querySelectorAll('.deny-staff-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          await updateDoc(doc(db, "staff", id), { status: "Denied" });
          showToast("Staff access denied.");
          loadStaffView();
        });
      });

      // Attach delete listeners
      tbody.querySelectorAll('.delete-staff-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          
          let modal = document.getElementById('deleteStaffConfirmModal');
          if (!modal) {
            const modalHtml = `
              <div id="deleteStaffConfirmModal" class="custom-modal-overlay">
                <div class="custom-modal-card">
                  <div class="custom-modal-icon">⚠️</div>
                  <h3>Revoke Staff Access</h3>
                  <p>Are you sure you want to remove this staff member? This will permanently revoke their access privileges to the admin panel.</p>
                  <div class="custom-modal-actions">
                    <button class="modal-btn modal-btn-cancel">Cancel</button>
                    <button class="modal-btn modal-btn-confirm delete-confirm-action-btn" style="background: #ef5350; color: #fff;">Remove Member</button>
                  </div>
                </div>
              </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modal = document.getElementById('deleteStaffConfirmModal');

            // Attach cancel click
            modal.querySelector('.modal-btn-cancel').addEventListener('click', () => {
              modal.classList.remove('active');
            });
          }

          // Clear old listeners by cloning the button
          const confirmBtn = modal.querySelector('.delete-confirm-action-btn');
          const newConfirmBtn = confirmBtn.cloneNode(true);
          confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

          newConfirmBtn.addEventListener('click', async () => {
            modal.classList.remove('active');
            try {
              await deleteDoc(doc(db, "staff", id));
              showToast("Staff role revoked.");
              loadStaffView();
            } catch (err) {
              console.error("Error revoking staff:", err);
              showToast("Error revoking staff privileges.", true);
            }
          });

          // Show modal
          setTimeout(() => modal.classList.add('active'), 50);
        });
      });

      // Attach edit listeners
      tbody.querySelectorAll('.edit-staff-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const docSnap = await getDoc(doc(db, "staff", id));
          if (docSnap.exists()) {
            const data = docSnap.data();
            currentEditingStaffId = id;
            document.getElementById('staffNameInput').value = data.name || '';
            document.getElementById('staffEmailInput').value = data.email || '';
            document.getElementById('staffRoleInput').value = data.role || 'Staff';
            document.getElementById('staffStatusInput').value = data.status || 'Approved';
            
            // Update form headers
            document.getElementById('staffFormTitle').textContent = "Edit Authorized Staff Details";
            document.getElementById('staffFormSubmitBtn').textContent = "Update Staff Member";
            document.getElementById('cancelStaffEditBtn').style.display = 'inline-block';
          }
        });
      });
    }

    // B. Build mock access audits
    if (logsTbody) {
      const loggedInEmail = auth.currentUser ? auth.currentUser.email : (sessionStorage.getItem('staffUserEmail') || 'admin@anjiana.com');
      
      const mockLogs = [
        { email: 'admin@anjiana.com', source: 'Chrome Windows 10 (Direct Access Console)', time: new Date() },
        { email: 'sarah@anjiana.com', source: 'Firefox MacOS Catalina Desktop', time: new Date(Date.now() - 3600 * 1000) },
        { email: 'sarah@anjiana.com', source: 'Safari iOS Mobile', time: new Date(Date.now() - 4 * 3600 * 1000) }
      ];

      // Filter logs for relevant staff if they are not Admin
      const filteredLogs = isUserAdmin 
        ? mockLogs 
        : mockLogs.filter(log => log.email.toLowerCase().trim() === loggedInEmail.toLowerCase().trim());

      logsTbody.innerHTML = '';
      if (filteredLogs.length > 0) {
        filteredLogs.forEach(log => {
          const tr = document.createElement('tr');
          tr.style.borderBottom = '1px solid var(--border-color)';
          tr.innerHTML = `
            <td>${log.email}</td>
            <td>${log.source}</td>
            <td>${log.time.toLocaleString()}</td>
          `;
          logsTbody.appendChild(tr);
        });
      } else {
        logsTbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">No login logs found for your account.</td></tr>`;
      }
    }

  } catch (err) {
    console.error("Staff management setup fail:", err);
  }
}

// --------------------------------------------------
// 14. SETTINGS & PARAMETERS CONFIGS
// --------------------------------------------------

async function loadSettingsView() {
  try {
    const sSnap = await getDoc(doc(db, "settings", "store_info"));
    if (sSnap.exists()) {
      const settings = sSnap.data();
      document.getElementById('setStoreName').value = settings.storeName || '';
      document.getElementById('setStoreEmail').value = settings.email || '';
      document.getElementById('setStorePhone').value = settings.phone || '';
      document.getElementById('setStoreAddress').value = settings.address || '';
      document.getElementById('setCurrency').value = settings.currency || 'Rs.';
      document.getElementById('setTaxRate').value = settings.taxRate || 10;
      
      if (document.getElementById('setStorefrontUrl')) {
        document.getElementById('setStorefrontUrl').value = settings.storeUrl || '../index.html';
      }
      if (document.getElementById('setAdminUrl')) {
        document.getElementById('setAdminUrl').value = settings.adminUrl || 'index.html';
      }

      if (settings.socialLinks) {
        document.getElementById('setFb').value = settings.socialLinks.facebook || '';
        document.getElementById('setIg').value = settings.socialLinks.instagram || '';
        document.getElementById('setTw').value = settings.socialLinks.twitter || '';
      }
    }
  } catch (err) {
    console.error("Settings load failure:", err);
  }
}

// --------------------------------------------------
// 15. NOTIFICATIONS PANEL SYSTEMS ( Bell Alerts )
// --------------------------------------------------

let notificationItemsList = [];

async function pollRealtimeNotifications() {
  notificationItemsList = [];

  try {
    // A. Check for low stock items
    const productsSnap = await getDocs(collection(db, "products"));
    productsSnap.forEach(pDoc => {
      const prod = pDoc.data();
      if (prod.variants && prod.variants.length > 0) {
        prod.variants.forEach(v => {
          if (parseInt(v.stock) <= 5) {
            notificationItemsList.push({
              title: `Low Stock Variant: ${prod.name}`,
              body: `Variant (${v.size}/${v.color}) has only ${v.stock} units left.`,
              time: new Date()
            });
          }
        });
      } else {
        if (parseInt(prod.stock) <= 5) {
          notificationItemsList.push({
            title: `Low Stock Product: ${prod.name}`,
            body: `Stock has fallen to ${prod.stock} units.`,
            time: new Date()
          });
        }
      }
    });

    // B. Check for return requests pending
    const ordersSnap = await getDocs(collection(db, "orders"));
    ordersSnap.forEach(oDoc => {
      const order = oDoc.data();
      if (order.returnRequest && order.returnRequest.status === 'Pending') {
        notificationItemsList.push({
          title: `Return Request: Order #${oDoc.id.slice(0,6).toUpperCase()}`,
          body: `${order.customer.firstName} requested ${order.returnRequest.type} for "${order.returnRequest.reason}"`,
          time: order.createdAt?.toDate ? order.createdAt.toDate() : new Date()
        });
      }
    });

    renderNotificationsBell();

  } catch (err) {
    console.error("Notifications scanning error:", err);
  }
}

function renderNotificationsBell() {
  const badge = document.getElementById('notifBadge');
  const container = document.getElementById('notifListContainer');
  if (!badge || !container) return;

  const count = notificationItemsList.length;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }

  container.innerHTML = '';
  if (count === 0) {
    container.innerHTML = `<div class="bell-dropdown-empty">No active notifications</div>`;
    return;
  }

  notificationItemsList.forEach(notif => {
    const div = document.createElement('div');
    div.className = 'bell-dropdown-item';
    div.innerHTML = `
      <div style="font-weight:600; color:var(--primary-color);">${notif.title}</div>
      <div style="margin-top:2px;">${notif.body}</div>
      <span class="notif-time">${notif.time.toLocaleTimeString()}</span>
    `;
    container.appendChild(div);
  });
}

// --------------------------------------------------
// GLOBAL ACTION FORM SUBMISSIONS LOGIC
// --------------------------------------------------

function attachGlobalEventHandlers() {
  // 1. Submit Product Form
  const productForm = document.getElementById('productForm');
  if (productForm) {
    productForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const saveBtn = document.getElementById('saveProductBtn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      try {
        const name = document.getElementById('prodName').value.trim();
        const brand = document.getElementById('prodBrand').value.trim();
        const category = document.getElementById('prodCategory').value;
        const gender = document.getElementById('prodGender').value;
        const material = document.getElementById('prodMaterial').value.trim();
        const price = parseFloat(document.getElementById('prodPrice').value);
        const discountInput = document.getElementById('prodDiscount').value;
        const discount = discountInput ? parseFloat(discountInput) : 0;
        const skuPrefix = document.getElementById('prodSku').value.trim();
        const desc = document.getElementById('prodDesc').value.trim();
        const status = document.querySelector('input[name="prodStatus"]:checked').value;

        // Build variants matrices
        const checkedSizes = Array.from(document.querySelectorAll('input[name="vSizes"]:checked')).map(cb => cb.value);
        const checkedColors = Array.from(document.querySelectorAll('input[name="vColors"]:checked')).map(cb => cb.value);
        const customColorStr = document.getElementById('customColors') ? document.getElementById('customColors').value.trim() : '';
        const customColors = customColorStr ? customColorStr.split(',').map(c => c.trim()).filter(Boolean) : [];
        const colors = [...new Set([...checkedColors, ...customColors])];

        let finalVariants = [];
        let totalComputedStock = 0;

        if (checkedSizes.length > 0 && colors.length > 0) {
          // Read variants matrix rows
          document.querySelectorAll('.matrix-stock-input').forEach(inp => {
            const size = inp.getAttribute('data-size');
            const color = inp.getAttribute('data-color');
            const qty = parseInt(inp.value) || 0;
            const customSku = document.querySelector(`.matrix-sku-input[data-size="${size}"][data-color="${color}"]`)?.value || '';

            finalVariants.push({ size, color, stock: qty, sku: customSku });
            totalComputedStock += qty;
          });
        } else {
          totalComputedStock = parseInt(document.getElementById('prodSingleStock').value) || 0;
        }

        // Handle image mock uploads
        // Fallback standard url placeholders for multi-image mock lists if files uploaded
        let imageUrls = [];
        if (selectedProductImageFiles.length > 0) {
          selectedProductImageFiles.forEach(fileOrUrl => {
            if (typeof fileOrUrl === 'string') {
              imageUrls.push(fileOrUrl);
            } else {
              // Write a mock placeholder image URL since mock uploads can't hit Storage limits
              imageUrls.push("https://images.unsplash.com/photo-1542272604-787c3835535d?w=400");
            }
          });
        } else {
          imageUrls.push("../images/placeholder.png");
        }

        const productData = {
          name,
          brand,
          category,
          gender,
          material,
          price,
          discount,
          sku: skuPrefix || `ANJ-C-${Date.now().toString().slice(-4)}`,
          description: desc,
          status,
          stock: totalComputedStock,
          imageUrl: imageUrls[0],
          images: imageUrls,
          variants: finalVariants,
          sizes: checkedSizes,
          colors: colors,
          views: currentEditingProductId ? 240 : 0, // preserve view count
          updatedAt: new Date()
        };

        if (currentEditingProductId) {
          await updateDoc(doc(db, "products", currentEditingProductId), productData);
          showToast("Product listing updated successfully!");
        } else {
          productData.createdAt = new Date();
          productData.views = Math.floor(Math.random() * 50);
          await addDoc(collection(db, "products"), productData);
          showToast("Product listing saved successfully!");
        }

        // Return to listings page
        window.location.hash = "#products";

      } catch (err) {
        console.error("Product submission failure:", err);
        showToast("Error saving product listing detail.", true);
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = currentEditingProductId ? 'Update Listing' : 'Save Product Listing';
      }
    });
  }

  // Change listener on target gender to update category dropdown
  const prodGenderSelect = document.getElementById('prodGender');
  if (prodGenderSelect) {
    prodGenderSelect.addEventListener('change', (e) => {
      populateCategoryDropdown(e.target.value);
    });
  }

  // 2. Submit Category Form
  const categoryForm = document.getElementById('categoryForm');
  if (categoryForm) {
    categoryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('saveCategoryBtn');
      saveBtn.disabled = true;

      try {
        const catId = document.getElementById('editCategoryId').value;
        const name = document.getElementById('catName').value.trim();
        const gender = document.getElementById('catGender').value;
        const parent = document.getElementById('catParent').value;
        const image = document.getElementById('catImage').value.trim() || "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=200";

        const catData = { name, gender, parent, image };

        if (catId) {
          await updateDoc(doc(db, "categories", catId), catData);
          showToast("Category updated.");
        } else {
          catData.createdAt = new Date();
          await addDoc(collection(db, "categories"), catData);
          showToast("Category added.");
        }

        categoryForm.reset();
        document.getElementById('editCategoryId').value = "";
        document.getElementById('categoryFormTitle').textContent = "Add Category";
        document.getElementById('resetCategoryFormBtn').style.display = 'none';
        
        loadCategoriesList();

      } catch (err) {
        console.error("Category save error:", err);
        showToast("Error saving category.", true);
      } finally {
        saveBtn.disabled = false;
      }
    });

    document.getElementById('resetCategoryFormBtn')?.addEventListener('click', () => {
      categoryForm.reset();
      document.getElementById('editCategoryId').value = "";
      document.getElementById('categoryFormTitle').textContent = "Add Category";
      document.getElementById('resetCategoryFormBtn').style.display = 'none';
    });
  }

  // 3. Complete Restock operations
  const restockForm = document.getElementById('restockForm');
  if (restockForm) {
    restockForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pId = document.getElementById('restockProductId').value;
      const size = document.getElementById('restockSize').value;
      const color = document.getElementById('restockColor').value;
      const restockQty = parseInt(document.getElementById('restockQuantityInput').value) || 0;

      try {
        const prodRef = doc(db, "products", pId);
        const pSnap = await getDoc(prodRef);
        
        if (pSnap.exists()) {
          const product = pSnap.data();

          if (product.variants && product.variants.length > 0) {
            // Update targeted variant quantities
            const updatedVariants = product.variants.map(v => {
              if (v.size === size && v.color === color) {
                return { ...v, stock: parseInt(v.stock) + restockQty };
              }
              return v;
            });
            await updateDoc(prodRef, {
              variants: updatedVariants,
              stock: parseInt(product.stock) + restockQty
            });
          } else {
            await updateDoc(prodRef, {
              stock: parseInt(product.stock) + restockQty
            });
          }

          // Create stock history log
          await addDoc(collection(db, "stock_history"), {
            productId: pId,
            productName: product.name,
            size: size,
            color: color,
            quantity: restockQty,
            type: "RESTOCK",
            operator: "System Admin",
            createdAt: new Date()
          });

          showToast("Inventory stock margin updated successfully.");
          document.getElementById('restockModal').classList.remove('active');
          loadInventoryView();
        }
      } catch (err) {
        console.error("Restock execution failure:", err);
      }
    });
  }

  // 4. Submit Coupon Code Creator
  const couponForm = document.getElementById('couponForm');
  if (couponForm) {
    couponForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const code = document.getElementById('cCode').value.toUpperCase().trim();
        const type = document.getElementById('cType').value;
        const value = parseInt(document.getElementById('cValue').value) || 0;
        const minAmount = parseInt(document.getElementById('cMinAmount').value) || 0;
        const expiry = document.getElementById('cExpiry').value || '';

        await addDoc(collection(db, "coupons"), {
          code, type, value, minAmount, expiry, status: "Active"
        });

        showToast("Discount coupon code created!");
        couponForm.reset();
        loadDiscountsView();
      } catch (err) {
        console.error("Coupon creator error:", err);
      }
    });
  }

  // 5. Submit Banner Slide
  const bannerForm = document.getElementById('bannerForm');
  if (bannerForm) {
    bannerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const title = document.getElementById('bannerTitle').value.trim();
        const imageUrl = document.getElementById('bannerImage').value.trim();
        const link = document.getElementById('bannerLink').value.trim();
        const type = document.getElementById('bannerType').value;

        await addDoc(collection(db, "banners"), {
          title, imageUrl, link, type, createdAt: new Date()
        });

        showToast("Homepage campaign banner added!");
        bannerForm.reset();
        loadDiscountsView();
      } catch (err) {
        console.error("Banner form save error:", err);
      }
    });
  }

  // 6. Submit Review Reply Form
  const replyForm = document.getElementById('replyForm');
  if (replyForm) {
    replyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rId = document.getElementById('replyReviewId').value;
      const text = document.getElementById('replyTextInput').value.trim();

      try {
        await updateDoc(doc(db, "reviews", rId), { reply: text });
        showToast("Response comment published!");
        document.getElementById('replyModal').classList.remove('active');
        loadReviewsList();
      } catch (err) {
        console.error("Review reply fail:", err);
      }
    });
  }

  // 7. Submit Staff Form
  const staffForm = document.getElementById('staffForm');
  if (staffForm) {
    staffForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // Strict permission check
      if (currentUserRole !== 'Admin') {
        showToast("Access Denied: Only Administrators can modify staff records.", true);
        return;
      }

      try {
        const name = document.getElementById('staffNameInput').value.trim();
        const email = document.getElementById('staffEmailInput').value.toLowerCase().trim();
        const role = document.getElementById('staffRoleInput').value;
        const status = document.getElementById('staffStatusInput').value;

        // Duplicate email validation check
        const q = query(collection(db, "staff"), where("email", "==", email));
        const snap = await getDocs(q);
        const isDuplicate = !snap.empty && snap.docs.some(docSnap => docSnap.id !== currentEditingStaffId);

        if (isDuplicate) {
          showToast("Error: A staff member with this email already exists.", true);
          alert("Error: A staff member with this email address already exists. Duplicate profiles are not allowed.");
          return;
        }

        if (currentEditingStaffId) {
          await updateDoc(doc(db, "staff", currentEditingStaffId), { name, email, role, status });
          showToast("Staff user credentials updated successfully.");
        } else {
          await addDoc(collection(db, "staff"), { name, email, role, status, createdAt: new Date() });
          showToast("Authorized staff member added.");
        }

        // Reset editing states
        currentEditingStaffId = "";
        staffForm.reset();
        document.getElementById('staffFormTitle').textContent = "Add Authorized Staff";
        document.getElementById('staffFormSubmitBtn').textContent = "Add Team Member";
        document.getElementById('cancelStaffEditBtn').style.display = 'none';

        loadStaffView();
      } catch (err) {
        console.error("Staff addition error:", err);
        showToast("Error updating staff credentials.", true);
        alert("Error saving staff user: " + err.message);
      }
    });

    // Cancel edit button listener
    document.getElementById('cancelStaffEditBtn')?.addEventListener('click', () => {
      currentEditingStaffId = "";
      staffForm.reset();
      document.getElementById('staffFormTitle').textContent = "Add Authorized Staff";
      document.getElementById('staffFormSubmitBtn').textContent = "Add Team Member";
      document.getElementById('cancelStaffEditBtn').style.display = 'none';
    });
  }

  // 8. Shipping Settings Form
  const shippingSettingsForm = document.getElementById('shippingSettingsForm');
  if (shippingSettingsForm) {
    shippingSettingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const standard = parseFloat(document.getElementById('shipStandardFee').value) || 0;
        const express = parseFloat(document.getElementById('shipExpressFee').value) || 0;
        const threshold = parseFloat(document.getElementById('shipFreeThreshold').value) || 0;
        const couriers = document.getElementById('shipCouriers').value.split(',').map(c => c.trim()).filter(Boolean);

        await setDoc(doc(db, "settings", "shipping_rules"), {
          standardFee: standard,
          expressFee: express,
          freeShippingThreshold: threshold,
          couriers: couriers,
          updatedAt: new Date()
        });

        showToast("Shipping settings saved successfully!");
      } catch (err) {
        console.error("Shipping rules save error:", err);
      }
    });
  }

  // 9. Store settings Form
  const storeSettingsForm = document.getElementById('storeSettingsForm');
  if (storeSettingsForm) {
    storeSettingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const storeName = document.getElementById('setStoreName').value.trim();
        const email = document.getElementById('setStoreEmail').value.trim();
        const phone = document.getElementById('setStorePhone').value.trim();
        const address = document.getElementById('setStoreAddress').value.trim();
        const currency = document.getElementById('setCurrency').value;
        const taxRate = parseFloat(document.getElementById('setTaxRate').value) || 0;
        const storeUrl = document.getElementById('setStorefrontUrl') ? document.getElementById('setStorefrontUrl').value.trim() : '../index.html';
        const adminUrl = document.getElementById('setAdminUrl') ? document.getElementById('setAdminUrl').value.trim() : 'index.html';

        const fb = document.getElementById('setFb').value.trim();
        const ig = document.getElementById('setIg').value.trim();
        const tw = document.getElementById('setTw').value.trim();

        await updateDoc(doc(db, "settings", "store_info"), {
          storeName, email, phone, address, currency, taxRate, storeUrl, adminUrl,
          socialLinks: { facebook: fb, instagram: ig, twitter: tw },
          updatedAt: new Date()
        });

        showToast("Store settings configuration updated.");
        loadSettingsView();

      } catch (err) {
        console.error("Store settings update fail:", err);
      }
    });
  }

  // Listeners for variant checkbox grid builders
  document.querySelectorAll('input[name="vSizes"]').forEach(cb => {
    cb.addEventListener('change', updateProductVariantsMatrix);
  });
  document.querySelectorAll('input[name="vColors"]').forEach(cb => {
    cb.addEventListener('change', updateProductVariantsMatrix);
  });
  document.getElementById('customColors')?.addEventListener('input', updateProductVariantsMatrix);
  document.getElementById('prodSku')?.addEventListener('input', updateProductVariantsMatrix);

  // Bulk stock apply listener
  document.getElementById('bulkStockApplyBtn')?.addEventListener('click', () => {
    const bulkVal = parseInt(document.getElementById('bulkStockInput').value) || 0;
    document.querySelectorAll('.matrix-stock-input').forEach(inp => {
      inp.value = bulkVal;
    });
  });

  // Multi-image upload drag and click attachments
  const multiImageDropzone = document.getElementById('multiImageDropzone');
  const prodImagesInput = document.getElementById('prodImagesInput');

  if (multiImageDropzone && prodImagesInput) {
    multiImageDropzone.addEventListener('click', () => prodImagesInput.click());
    prodImagesInput.addEventListener('change', (e) => {
      handleMultiImages(e.target.files);
    });
  }

  // Close modals listeners
  document.getElementById('closeOrderModal')?.addEventListener('click', () => {
    document.getElementById('orderDetailModal').classList.remove('active');
  });
  document.getElementById('closeCustomerModal')?.addEventListener('click', () => {
    document.getElementById('customerDetailModal').classList.remove('active');
  });
  document.getElementById('closeRestockModal')?.addEventListener('click', () => {
    document.getElementById('restockModal').classList.remove('active');
  });
  document.getElementById('closeReplyModal')?.addEventListener('click', () => {
    document.getElementById('replyModal').classList.remove('active');
  });

  // Notification clear all
  document.getElementById('clearNotifBtn')?.addEventListener('click', () => {
    notificationItemsList = [];
    renderNotificationsBell();
    showToast("Notifications cleared.");
  });

  // Scope analytical switch
  document.getElementById('reportScope')?.addEventListener('change', loadReportsView);

  // Toggle notifications dropdown
  const bellBtn = document.querySelector('.bell-container button');
  const bellDrop = document.getElementById('notifDropdown');
  if (bellBtn && bellDrop) {
    bellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      bellDrop.classList.toggle('active');
    });
    document.addEventListener('click', () => {
      bellDrop.classList.remove('active');
    });
    bellDrop.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
}

// --------------------------------------------------
// ROLE & PERMISSIONS MANAGEMENT (Admin vs. Staff)
// --------------------------------------------------

async function getUserRole(email) {
  if (!email) return "Staff";
  try {
    const q = query(collection(db, "staff"), where("email", "==", email.toLowerCase().trim()));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const staffDoc = snap.docs[0].data();
      return staffDoc.role || "Staff";
    }
  } catch (err) {
    console.error("Error getting user role:", err);
  }
  // Hardcoded fallback for default bootstrap admin
  if (email.toLowerCase().trim() === 'admin@anjiana.com') {
    return 'Admin';
  }
  return "Staff";
}

function applyUserRolePermissions() {
  const isUserAdmin = currentUserRole === 'Admin';
  
  // A. Staff creation form lock/unlock
  const staffForm = document.getElementById('staffForm');
  if (staffForm) {
    const inputs = staffForm.querySelectorAll('input, select, button');
    inputs.forEach(inp => {
      inp.disabled = !isUserAdmin;
    });

    if (!isUserAdmin) {
      staffForm.style.opacity = '0.5';
      staffForm.style.pointerEvents = 'none';
      
      let note = document.getElementById('adminOnlyStaffNote');
      if (!note) {
        note = document.createElement('div');
        note.id = 'adminOnlyStaffNote';
        note.style.color = 'var(--error-color)';
        note.style.fontSize = '0.85rem';
        note.style.fontWeight = '600';
        note.style.marginBottom = '1rem';
        note.textContent = '🔒 Only Administrators can create or modify staff users.';
        staffForm.parentNode.insertBefore(note, staffForm);
      }
    } else {
      staffForm.style.opacity = '1';
      staffForm.style.pointerEvents = 'auto';
      const note = document.getElementById('adminOnlyStaffNote');
      if (note) note.remove();
    }
  }

  // B. Hide restricted sidebar navigation items from Staff users
  const isStaff = currentUserRole === 'Staff';
  const restrictedTabs = ['categories', 'payments', 'shipping', 'discounts', 'staff', 'settings'];
  
  restrictedTabs.forEach(tab => {
    const navItem = document.querySelector(`.nav-item[data-tab="${tab}"]`);
    if (navItem) {
      navItem.style.display = isStaff ? 'none' : 'flex';
    }
  });

  // C. Redirect Staff away from restricted views if typed in url hash
  if (isStaff) {
    let cleanHash = window.location.hash.replace(/^#/, '');
    if (cleanHash.includes('?')) {
      cleanHash = cleanHash.split('?')[0];
    }
    if (restrictedTabs.includes(cleanHash)) {
      window.location.hash = '#dashboard';
    }
  }

  // D. Refresh current views context
  if (window.location.hash === '#staff') {
    loadStaffView();
  }
}

// Watch auth states to load role details
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUserRole = await getUserRole(user.email);
    console.log("Logged in user email:", user.email, "role:", currentUserRole);
    applyUserRolePermissions();
  } else {
    // Check if we have an active staff session in sessionStorage (email-only fallback)
    const staffEmail = sessionStorage.getItem('staffUserEmail');
    if (staffEmail) {
      currentUserRole = sessionStorage.getItem('staffUserRole') || "Staff";
      console.log("Logged in staff user email:", staffEmail, "role:", currentUserRole);
    } else {
      currentUserRole = "Staff";
    }
    applyUserRolePermissions();
  }
});

// --------------------------------------------------
// DOCUMENT LOADER INITIALIZER
// --------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  // Save absolute admin URL to localStorage for storefront routing
  localStorage.setItem('adminUrl', window.location.href);

  // 1. Check and seed collections
  await checkAndSeedData();

  // 2. Poll Notifications
  pollRealtimeNotifications();
  setInterval(pollRealtimeNotifications, 30000); // refresh notifications every 30s

  // 3. Attach global form handlers
  attachGlobalEventHandlers();

  // 4. Initial Routing
  switchView(window.location.hash);

  // 5. Watch Routing Changes
  window.addEventListener('hashchange', () => {
    switchView(window.location.hash);
  });
});
