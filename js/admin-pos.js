import { db, collection, getDocs, addDoc, doc, updateDoc } from './firebase-config.js';

// DOM Elements
const posProductGrid = document.getElementById('posProductGrid');
const registerItems = document.getElementById('registerItems');
const posSubtotal = document.getElementById('posSubtotal');
const posTax = document.getElementById('posTax');
const posTotal = document.getElementById('posTotal');
const completeSaleBtn = document.getElementById('completeSaleBtn');
const posSearch = document.getElementById('posSearch');

let allProducts = [];
let cart = [];

// Fetch products from Firestore
async function fetchProducts() {
    try {
        const querySnapshot = await getDocs(collection(db, "products"));
        allProducts = [];
        querySnapshot.forEach(docSnap => {
            allProducts.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });
        renderProducts(allProducts);
    } catch (error) {
        console.error("Error fetching products for POS: ", error);
        if (posProductGrid) {
            posProductGrid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--error-color); padding: 2rem;">Failed to load products.</div>`;
        }
    }
}

// Render products grid
function renderProducts(products) {
    if (!posProductGrid) return;
    posProductGrid.innerHTML = '';
    
    if (products.length === 0) {
        posProductGrid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 2rem;">No products found.</div>`;
        return;
    }

    products.forEach(product => {
        const isOutOfStock = product.stock <= 0;
        const card = document.createElement('div');
        card.className = 'pos-product-card';
        if (isOutOfStock) {
            card.style.opacity = '0.5';
            card.style.cursor = 'not-allowed';
        }
        
        const price = parseFloat(product.price);
        const discount = parseFloat(product.discount || 0);
        let priceHTML = '';
        if (discount > 0) {
            const discountedPrice = price * (1 - discount / 100);
            priceHTML = `
                <div style="display: flex; justify-content: center; align-items: baseline; gap: 0.4rem;">
                    <span style="text-decoration: line-through; color: var(--text-muted); font-size: 0.8rem;">$${price.toFixed(2)}</span>
                    <span class="pos-product-price" style="font-weight: 700; color: var(--accent-color); font-size: 0.95rem;">$${discountedPrice.toFixed(2)}</span>
                </div>
                <div style="background: rgba(212, 175, 55, 0.1); color: var(--accent-color); padding: 1px 4px; border-radius: 2px; font-size: 0.7rem; font-weight: 500; display: inline-block; margin-top: 2px;">-${discount}%</div>
            `;
        } else {
            priceHTML = `<div class="pos-product-price" style="font-weight: 700; color: var(--accent-color);">$${price.toFixed(2)}</div>`;
        }

        card.innerHTML = `
            <img src="${product.imageUrl || '../images/placeholder.png'}" class="pos-product-img" alt="${product.name}">
            <div class="pos-product-title" title="${product.name}" style="margin-top: 0.5rem; font-weight: 500; font-size: 0.9rem;">${product.name}</div>
            <div style="min-height: 38px; display: flex; flex-direction: column; justify-content: center; align-items: center;">${priceHTML}</div>
            <div style="font-size: 0.75rem; color: ${isOutOfStock ? 'var(--error-color)' : 'var(--text-muted)'}; margin-top: 0.25rem;">
                ${isOutOfStock ? 'Out of Stock' : `Stock: ${product.stock}`}
            </div>
        `;

        if (!isOutOfStock) {
            card.addEventListener('click', () => addToCart(product));
        }
        posProductGrid.appendChild(card);
    });
}

// Add product to cart
function addToCart(product) {
    const existingItem = cart.find(item => item.id === product.id);
    
    const price = parseFloat(product.price);
    const discount = parseFloat(product.discount || 0);
    const sellingPrice = discount > 0 ? (price * (1 - discount / 100)) : price;
    
    if (existingItem) {
        if (existingItem.quantity < product.stock) {
            existingItem.quantity++;
        } else {
            alert(`Cannot add more. Only ${product.stock} units in stock.`);
        }
    } else {
        // Default selected size: if product has sizes array, pick the first one, otherwise 'N/A'
        const size = (product.sizes && product.sizes.length > 0) ? product.sizes[0] : 'N/A';
        cart.push({
            id: product.id,
            name: product.name,
            price: sellingPrice,
            imageUrl: product.imageUrl,
            sizes: product.sizes || [],
            selectedSize: size,
            quantity: 1,
            maxStock: product.stock
        });
    }
    renderCart();
}

// Update item quantity
function updateQuantity(id, newQty) {
    const item = cart.find(item => item.id === id);
    if (!item) return;

    if (newQty <= 0) {
        removeFromCart(id);
        return;
    }

    if (newQty > item.maxStock) {
        alert(`Cannot set quantity to ${newQty}. Only ${item.maxStock} units in stock.`);
        item.quantity = item.maxStock;
    } else {
        item.quantity = newQty;
    }
    renderCart();
}

// Update item size
function updateSize(id, newSize) {
    const item = cart.find(item => item.id === id);
    if (item) {
        item.selectedSize = newSize;
    }
}

// Remove item from cart
function removeFromCart(id) {
    cart = cart.filter(item => item.id !== id);
    renderCart();
}

// Render cart items
function renderCart() {
    if (!registerItems) return;
    registerItems.innerHTML = '';
    
    if (cart.length === 0) {
        registerItems.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem; font-size: 0.9rem;">No items in cart</div>`;
        if (posSubtotal) posSubtotal.textContent = '$0.00';
        if (posTax) posTax.textContent = '$0.00';
        if (posTotal) posTotal.textContent = '$0.00';
        if (completeSaleBtn) completeSaleBtn.disabled = true;
        return;
    }

    let subtotal = 0;

    cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;

        const row = document.createElement('div');
        row.className = 'register-item';
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '0.75rem 0';
        row.style.borderBottom = '1px dashed var(--border-color)';
        
        // Build size selection if applicable
        let sizeSelectHTML = '';
        if (item.sizes && item.sizes.length > 0) {
            sizeSelectHTML = `
                <select class="item-size-select" data-id="${item.id}" style="padding: 2px 4px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: 0.8rem; background: var(--surface-color); color: var(--primary-color);">
                    ${item.sizes.map(sz => `<option value="${sz}" ${sz === item.selectedSize ? 'selected' : ''}>${sz}</option>`).join('')}
                </select>
            `;
        } else {
            sizeSelectHTML = `<span style="font-size: 0.8rem; color: var(--text-muted);">N/A</span>`;
        }

        row.innerHTML = `
            <div style="flex-grow: 1; min-width: 0; padding-right: 0.5rem;">
                <div style="font-weight: 500; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--primary-color);">${item.name}</div>
                <div style="display: flex; gap: 0.5rem; align-items: center; margin-top: 0.25rem;">
                    <span style="font-size: 0.85rem; color: var(--accent-color); font-weight: 600;">$${item.price.toFixed(2)}</span>
                    <span style="color: var(--text-muted); font-size: 0.8rem;">Size:</span>
                    ${sizeSelectHTML}
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <div style="display: flex; align-items: center; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-color);">
                    <button class="qty-btn dec-btn" data-id="${item.id}" style="border: none; background: none; padding: 4px 8px; cursor: pointer; color: var(--primary-color); font-weight: bold;">-</button>
                    <span style="padding: 0 4px; font-size: 0.9rem; font-weight: 500; min-width: 20px; text-align: center; color: var(--primary-color);">${item.quantity}</span>
                    <button class="qty-btn inc-btn" data-id="${item.id}" style="border: none; background: none; padding: 4px 8px; cursor: pointer; color: var(--primary-color); font-weight: bold;">+</button>
                </div>
                <button class="delete-item-btn" data-id="${item.id}" style="border: none; background: none; cursor: pointer; font-size: 1.25rem; color: var(--error-color); padding: 4px; line-height: 1;">&times;</button>
            </div>
        `;

        registerItems.appendChild(row);
    });

    // Subtotal and Total calculations
    const taxRate = 0.0; // 0% tax
    const tax = subtotal * taxRate;
    const total = subtotal + tax;

    if (posSubtotal) posSubtotal.textContent = `$${subtotal.toFixed(2)}`;
    if (posTax) posTax.textContent = `$${tax.toFixed(2)}`;
    if (posTotal) posTotal.textContent = `$${total.toFixed(2)}`;
    if (completeSaleBtn) completeSaleBtn.disabled = false;

    // Attach listeners
    registerItems.querySelectorAll('.dec-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const item = cart.find(i => i.id === id);
            if (item) updateQuantity(id, item.quantity - 1);
        });
    });

    registerItems.querySelectorAll('.inc-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const item = cart.find(i => i.id === id);
            if (item) updateQuantity(id, item.quantity + 1);
        });
    });

    registerItems.querySelectorAll('.delete-item-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            removeFromCart(id);
        });
    });

    registerItems.querySelectorAll('.item-size-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const id = select.getAttribute('data-id');
            updateSize(id, e.target.value);
        });
    });
}

// Filter products based on search query
if (posSearch) {
    posSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query) {
            renderProducts(allProducts);
            return;
        }
        const filtered = allProducts.filter(p => 
            p.name.toLowerCase().includes(query) || 
            (p.category && p.category.toLowerCase().includes(query))
        );
        renderProducts(filtered);
    });
}

// Complete Sale and record to Firestore
async function handleCompleteSale() {
    if (cart.length === 0) return;

    if (completeSaleBtn) {
        completeSaleBtn.disabled = true;
        completeSaleBtn.textContent = 'Processing...';
    }

    try {
        const customer = {
            firstName: "Walk-in",
            lastName: "Customer",
            email: "walkin@customer.com",
            phone: "N/A",
            address: "In-Store Sale",
            city: "In-Store",
            district: "In-Store",
            postalCode: "N/A"
        };

        // Standardize items for the order collection
        const orderItems = cart.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            imageUrl: item.imageUrl || '',
            size: item.selectedSize,
            quantity: item.quantity
        }));

        const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const totalAmount = subtotal; // 0% tax, no shipping

        const orderData = {
            customer,
            items: orderItems,
            subtotal: subtotal,
            shipping: 0,
            totalAmount: totalAmount,
            paymentStatus: 'Paid',
            orderStatus: 'Delivered', // In-store completed sale is Delivered
            createdAt: new Date()
        };

        // 1. Save order to Firestore
        const docRef = await addDoc(collection(db, "orders"), orderData);

        // 2. Decrement stock in Firestore for each item
        for (const item of cart) {
            const newStock = Math.max(0, item.maxStock - item.quantity);
            const productRef = doc(db, "products", item.id);
            await updateDoc(productRef, { stock: newStock });
        }

        alert(`Sale completed successfully! Receipt ID: ${docRef.id}`);

        // 3. Clear cart and reload products to get updated stock counts
        cart = [];
        renderCart();
        await fetchProducts();

    } catch (error) {
        console.error("Error completing POS sale: ", error);
        alert("Failed to complete sale: " + error.message);
    } finally {
        if (completeSaleBtn) {
            completeSaleBtn.disabled = false;
            completeSaleBtn.textContent = 'Complete Sale';
        }
    }
}

if (completeSaleBtn) {
    completeSaleBtn.addEventListener('click', handleCompleteSale);
}

// Initial fetch
fetchProducts();
